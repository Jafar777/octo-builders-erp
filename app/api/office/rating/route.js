import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { hrMonthState, todayIn } from "@/lib/hr";
import { MONTH_OK } from "@/lib/hrAccess";
import { canRateManagers, ratingPercent } from "@/lib/managerKpi";
import { NAME_FIELDS, pickName, viewerLang } from "@/lib/personName";
import { getSettings } from "@/lib/settings";
import { OFFICE_RATING_CRITERIA } from "@/lib/kpi/office";
import ManagerRating from "@/models/ManagerRating";
import Role from "@/models/Role";
import User from "@/models/User";

// The CEO's monthly rating of the office (roles with kpiProfile "office"): 1–5 on each
// criterion. It's a part of their KPI (lib/kpi/office.js).
async function officePeople() {
  const roles = (await Role.find({ kpiProfile: "office" }, { key: 1 }).lean()).map((r) => r.key);
  return User.find({ status: "active", role: { $in: roles } }, { ...NAME_FIELDS, avatarUrl: 1 }).lean();
}

// ?month= → the office people with this month's rating.
export async function GET(request) {
  const user = await getCurrentUser();
  if (!canRateManagers(user)) return forbidden();
  const p = new URL(request.url).searchParams.get("month");
  const month = MONTH_OK(p) ? p : todayIn((await getSettings()).hr.timezone).slice(0, 7);
  const people = await officePeople();
  const ratings = await ManagerRating.find({ month, user: { $in: people.map((x) => x._id) } }).lean();
  const lang = await viewerLang();
  return NextResponse.json({
    month,
    criteria: OFFICE_RATING_CRITERIA,
    closed: Boolean((await hrMonthState(month)).closed),
    people: people.map((x) => {
      const r = ratings.find((y) => String(y.user) === String(x._id));
      return {
        id: String(x._id),
        name: pickName(x, lang),
        avatarUrl: x.avatarUrl || "",
        rating: r ? { scores: Object.fromEntries((r.scores || []).map((s) => [s.key, s.score])), note: r.note || "", percent: ratingPercent(r, OFFICE_RATING_CRITERIA) } : null,
      };
    }),
  });
}

// { month, userId, scores: { key: 1–5 }, note }
export async function PUT(request) {
  const user = await getCurrentUser();
  if (!canRateManagers(user)) return forbidden();
  const b = await readJson(request);
  if (!MONTH_OK(b.month) || !isObjectId(b.userId)) return fail("invalid_request");
  if ((await hrMonthState(b.month)).closed) return fail("month_closed", 409);
  if (!(await officePeople()).some((x) => String(x._id) === b.userId)) return fail("invalid_request");
  const scores = OFFICE_RATING_CRITERIA.map((c) => ({ key: c.key, score: Math.round(Number(b.scores?.[c.key])) })).filter((s) => s.score >= 1 && s.score <= 5);
  if (scores.length !== OFFICE_RATING_CRITERIA.length) return fail("rating_incomplete");
  await ManagerRating.findOneAndUpdate(
    { month: b.month, user: b.userId },
    { month: b.month, user: b.userId, scores, note: String(b.note || "").slice(0, 2000), ratedBy: user.id },
    { upsert: true }
  );
  await audit(user, "kpi.office_rated", { entityType: "user", entityId: b.userId, summary: `${b.month} · ${ratingPercent({ scores }, OFFICE_RATING_CRITERIA)}%` });
  await notify({ type: "kpi.manager_rated", recipients: [b.userId], actor: user, params: { month: b.month }, link: "/dashboard/kpi", entityType: "user", entityId: b.userId });
  return NextResponse.json({ ok: true });
}
