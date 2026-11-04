import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { fail, forbidden, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { bonusStanding, monthSplit } from "@/lib/bonus";
import { computeMonth, hrMonthState, hrStaff, todayIn } from "@/lib/hr";
import { MONTH_OK, staffInScope } from "@/lib/hrAccess";
import { notify, usersWithPermission } from "@/lib/notify";
import { getSettings } from "@/lib/settings";
import HrMonth from "@/models/HrMonth";
import User from "@/models/User";

// The month's bonus is set by company-wide payroll managers (the GM).
const canManageBonus = (user) => hasPermission(user, "payroll.manage") && user.scope === "all";

// ?month=YYYY-MM → the month's bonus, my standing, and (kpi.view) the full ranking.
export async function GET(request) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const settings = await getSettings();
  const param = new URL(request.url).searchParams.get("month");
  const month = MONTH_OK(param) ? param : todayIn(settings.hr.timezone).slice(0, 7);

  const data = await computeMonth(month, { staff: await hrStaff({ status: "active" }) });
  const standing = bonusStanding(data.rows, user.id, { ...data.state, month }, settings);

  // Names of the people holding the places only for managers who see the KPI board.
  const canBoard = hasPermission(user, "kpi.view");
  const visible = canBoard ? new Set((await staffInScope(user, "kpi.view")).map((s) => s.id)) : new Set();
  const ranking = canBoard
    ? data.rows
        .filter((r) => r.kpi && visible.has(r.staff.id))
        .sort((a, b) => a.kpi.rank - b.kpi.rank)
        .map((r) => ({ userId: r.staff.id, name: r.staff.name, avatarUrl: r.staff.avatarUrl, score: r.kpi.score, rank: r.kpi.rank, bonus: r.kpi.bonus }))
    : [];
  if (canBoard) {
    const names = Object.fromEntries(ranking.map((r) => [r.userId, r.name]));
    for (const p of standing.places) p.holderName = names[p.holderId] || null;
  }

  return NextResponse.json({
    ...standing,
    ranking,
    canManage: canManageBonus(user),
    defaultSplit: settings.hr.bonusSplit,
    currencies: [settings.currencies.base, ...(settings.currencies.list || []).map((c) => c.code)].filter((c, i, a) => c && a.indexOf(c) === i),
  });
}

// GM: { month, bonusPool, bonusCurrency, bonusSplit: [50, 30, 20], bonusNote, announce }
export async function PATCH(request) {
  const user = await requireStaff();
  if (!user || !canManageBonus(user)) return forbidden();
  const body = await readJson(request);
  if (!MONTH_OK(body.month)) return fail("invalid_date");
  const state = await hrMonthState(body.month);
  if (state.closed) return fail("month_closed", 409);
  const settings = await getSettings();

  const split = (Array.isArray(body.bonusSplit) ? body.bonusSplit : []).map(Number).slice(0, 10);
  if (split.some((n) => !Number.isFinite(n) || n < 0 || n > 100)) return fail("invalid_bonus_split");
  if (split.reduce((a, b) => a + b, 0) > 100) return fail("bonus_split_over_100");

  const update = {
    month: body.month,
    bonusPool: Math.max(0, Number(body.bonusPool) || 0),
    bonusCurrency: String(body.bonusCurrency || settings.currencies.base).toUpperCase().slice(0, 6),
    bonusSplit: split,
    bonusMinScore: 0,
    bonusNote: String(body.bonusNote || "").slice(0, 1000),
  };
  if (body.announce) update.bonusAnnouncedAt = new Date();
  await HrMonth.findOneAndUpdate({ month: body.month }, update, { upsert: true });
  await audit(user, "payroll.bonus_pool", {
    entityType: "month",
    entityId: body.month,
    summary: `${update.bonusPool} ${update.bonusCurrency} · ${monthSplit(update, settings).join("/")}%`,
  });

  // Tell everyone who is scored this month (and HR) that the bonus is set.
  if (body.announce && update.bonusPool > 0) {
    const staff = await User.find({ status: "active", role: { $nin: ["user", "gm", "ceo", "coder"] } }, { _id: 1 }).lean();
    const hr = await usersWithPermission("payroll.view");
    await notify({
      type: "kpi.bonus_announced",
      recipients: [...staff.map((s) => s._id.toString()), ...hr],
      actor: user,
      params: { amount: `${update.bonusPool} ${update.bonusCurrency}`, month: body.month },
      link: "/dashboard/bonus",
      entityType: "month",
      entityId: body.month,
    });
  }
  return NextResponse.json({ ok: true });
}
