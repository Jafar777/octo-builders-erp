import { NextResponse } from "next/server";
import { hasPermission, requirePermission } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { localParts } from "@/lib/attendance";
import { utilization } from "@/lib/evm";
import { hourlyRates } from "@/lib/costRates";
import { pickName, viewerLang } from "@/lib/personName";
import { outsideRoleKeys, inDepartments } from "@/lib/scope";
import { getSettings } from "@/lib/settings";
import { monthWorkHours } from "@/lib/workDays";
import Task from "@/models/Task";
import User from "@/models/User";

const idStr = (v) => (v ? v.toString() : null);
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Utilization for a month: each person's hours on project work (task timers) against
// their available working hours. Department scope sees their departments' people.
// With finance.view also the labour cost of that time. ?month=YYYY-MM
export async function GET(request) {
  const user = await requirePermission("analytics.view");
  if (!user?.isStaff || user.limited) return forbidden();
  const settings = await getSettings();
  const tz = settings.hr.timezone;
  const raw = new URL(request.url).searchParams.get("month") || "";
  const month = /^\d{4}-\d{2}$/.test(raw) ? raw : localParts(new Date(), tz).date.slice(0, 7);

  const peopleQuery = { status: "active", role: { $nin: await outsideRoleKeys() } };
  if (user.scope !== "all") Object.assign(peopleQuery, user.scope === "department" ? inDepartments(user) : { _id: user.id });
  const people = await User.find(peopleQuery, { name: 1, nameAr: 1, email: 1, avatarUrl: 1, department: 1, workSchedule: 1 }).lean();
  const ids = people.map((p) => p._id);

  // Work counted in the month it was handed in (or started, while still going).
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1) - 3 * 3600000);
  const to = new Date(Date.UTC(y, m, 1) + 3 * 3600000);
  const tasks = await Task.find(
    { assignee: { $in: ids }, activeMs: { $gt: 0 }, $or: [{ submittedAt: { $gte: from, $lt: to } }, { submittedAt: null, startedAt: { $gte: from, $lt: to } }] },
    { assignee: 1, project: 1, activeMs: 1, submittedAt: 1, startedAt: 1 }
  ).lean();
  const worked = tasks
    .filter((t) => localParts(t.submittedAt || t.startedAt, tz).date.startsWith(month))
    .map((t) => ({ person: idStr(t.assignee), project: idStr(t.project), hours: t.activeMs / 3600000 }));

  const monthHours = monthWorkHours(month, settings);
  const available = Object.fromEntries(people.map((p) => [idStr(p._id), monthHours]));
  const rows = utilization(worked, available);
  const rates = hasPermission(user, "finance.view") ? await hourlyRates(ids, settings) : null;
  const lang = await viewerLang();
  const byId = Object.fromEntries(people.map((p) => [idStr(p._id), p]));

  return NextResponse.json({
    month,
    monthHours,
    base: settings.currencies.base,
    people: rows
      .filter((r) => byId[r.person])
      .map((r) => ({
        ...r,
        name: pickName(byId[r.person], lang),
        avatarUrl: byId[r.person].avatarUrl || "",
        department: idStr(byId[r.person].department),
        cost: rates ? r2((r.projectHours + r.otherHours) * (rates[r.person] || 0)) : undefined,
      }))
      .sort((a, b) => (b.utilization ?? -1) - (a.utilization ?? -1)),
  });
}
