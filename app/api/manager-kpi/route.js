import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { computeMonth, hrMonthState, hrStaff, todayIn } from "@/lib/hr";
import { MONTH_OK } from "@/lib/hrAccess";
import { canRateManagers, isDeptManager, managerRoleKeys, ratingPercent } from "@/lib/managerKpi";
import { notify } from "@/lib/notify";
import { pickName, viewerLang } from "@/lib/personName";
import { getSettings } from "@/lib/settings";
import ManagerRating from "@/models/ManagerRating";
import User from "@/models/User";

// ?month=YYYY-MM → department managers' KPI: the system part (attendance + tasks),
// the GM / CEO rating, and the blended score. GM / CEO see everyone; a department
// manager sees only themselves.
export async function GET(request) {
  const user = await requireStaff();
  const canRate = canRateManagers(user);
  if (!user || (!canRate && !isDeptManager(user))) return forbidden();

  const settings = await getSettings();
  const param = new URL(request.url).searchParams.get("month");
  const month = MONTH_OK(param) ? param : todayIn(settings.hr.timezone).slice(0, 7);
  const { weight, criteria } = settings.managerKpi;

  const roles = await managerRoleKeys();
  const staff = await hrStaff({ status: "active" });
  const managers = staff.filter((s) => roles.includes(s.role) && (canRate || s.id === user.id));
  const data = await computeMonth(month, { staff });
  const ratings = await ManagerRating.find({ month, user: { $in: managers.map((m) => m.id) } }).lean();
  const ratingBy = Object.fromEntries(ratings.map((r) => [r.user.toString(), r]));
  const raters = await User.find({ _id: { $in: ratings.map((r) => r.ratedBy).filter(Boolean) } }, { name: 1, nameAr: 1, email: 1 }).lean();
  const lang = await viewerLang();
  const raterName = Object.fromEntries(raters.map((u) => [u._id.toString(), pickName(u, lang)]));

  return NextResponse.json({
    month,
    closed: Boolean(data.state.closed),
    canRate,
    weight,
    criteria,
    managers: managers.map((m) => {
      const row = data.rows.find((r) => r.staff.id === m.id);
      const s = row?.attendance?.summary;
      const rating = ratingBy[m.id];
      return {
        id: m.id,
        name: m.name,
        avatarUrl: m.avatarUrl,
        department: m.department,
        kpi: row?.kpi
          ? {
              score: row.kpi.score,
              systemScore: row.kpi.systemScore ?? row.kpi.score,
              manualScore: row.kpi.manualScore ?? null,
              grade: row.kpi.grade,
              rank: row.kpi.rank,
              of: row.kpi.of,
              indicators: (row.kpi.indicators || []).map((i) => ({ key: i.key, name: i.name, percent: i.percent ?? (i.max ? Math.round((i.points / i.max) * 100) : 0) })),
            }
          : null,
        attendance: s
          ? { workedHours: s.workedHours, requiredHours: s.requiredToDate, presentDays: s.presentDays, absentDays: s.absentDays, lateCount: s.lateCount, warnings: s.warnings }
          : null,
        rating: rating
          ? {
              scores: Object.fromEntries((rating.scores || []).map((x) => [x.key, x.score])),
              percent: ratingPercent(rating, criteria),
              note: rating.note,
              ratedBy: raterName[rating.ratedBy?.toString()] || null,
              updatedAt: rating.updatedAt,
            }
          : null,
      };
    }),
  });
}

// GM / CEO: { month, userId, scores: { criterionKey: 1–5 }, note }
export async function PUT(request) {
  const user = await requireStaff();
  if (!user || !canRateManagers(user)) return forbidden();
  const body = await readJson(request);
  if (!MONTH_OK(body.month) || !isObjectId(body.userId)) return fail("invalid_request");
  if ((await hrMonthState(body.month)).closed) return fail("month_closed", 409);

  const target = await User.findById(body.userId, { role: 1, name: 1 }).lean();
  if (!target || !(await managerRoleKeys()).includes(target.role)) return fail("not_a_manager");

  const { criteria } = (await getSettings()).managerKpi;
  const scores = criteria
    .map((c) => ({ key: c.key, score: Math.round(Number(body.scores?.[c.key])) }))
    .filter((s) => s.score >= 1 && s.score <= 5);
  if (scores.length !== criteria.length) return fail("rating_incomplete");

  await ManagerRating.findOneAndUpdate(
    { month: body.month, user: body.userId },
    { month: body.month, user: body.userId, scores, note: String(body.note || "").slice(0, 2000), ratedBy: user.id },
    { upsert: true }
  );
  await audit(user, "kpi.manager_rated", { entityType: "user", entityId: body.userId, summary: `${body.month} · ${ratingPercent({ scores }, criteria)}%` });
  await notify({
    type: "kpi.manager_rated",
    recipients: [body.userId],
    actor: user,
    params: { month: body.month },
    link: "/dashboard/manager-kpi",
    entityType: "user",
    entityId: body.userId,
  });
  return NextResponse.json({ ok: true });
}
