import User from "@/models/User";
import RawPunch from "@/models/RawPunch";
import AttendanceOverride from "@/models/AttendanceOverride";
import LeaveRequest from "@/models/LeaveRequest";
import OvertimeRequest from "@/models/OvertimeRequest";
import SalaryHistory from "@/models/SalaryHistory";
import HrMonth from "@/models/HrMonth";
import PayrollRecord from "@/models/PayrollRecord";
import KpiResult from "@/models/KpiResult";
import ManagerRating from "@/models/ManagerRating";
import { managerRoleKeys, ratingPercent } from "@/lib/managerKpi";
import Task from "@/models/Task";
import { getSettings } from "@/lib/settings";
import { computeAttendance, computePayroll, localParts, monthDays } from "@/lib/attendance";
import { weekdayHours } from "@/lib/workDays";
import { kpiConfigFor } from "@/lib/kpi/config";
import { computeKpi, creditHours } from "@/lib/kpi/engine";
import { DEFAULT_ROLE } from "@/lib/permissions";
import { pickName, viewerLang } from "@/lib/personName";
import { HIDDEN_ROLES } from "@/lib/permissions";

const idStr = (v) => (v ? v.toString() : null);

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function todayIn(tz) {
  return localParts(new Date(), tz).date;
}

// Instant bounds of a month in the HR time zone (± 1 day margin; exact day
// assignment happens in computeAttendance).
function monthRange(month) {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1) - 86400000), end: new Date(Date.UTC(y, m, 1) + 86400000) };
}

// Staff whose attendance / KPI / payroll are calculated.
export async function hrStaff(filter = {}) {
  // The hidden coder accounts aren't on HR's, KPI's or anyone's list.
  const users = await User.find({ role: { $nin: [DEFAULT_ROLE, ...HIDDEN_ROLES] }, ...filter }).sort({ name: 1 }).lean();
  const lang = await viewerLang();
  return users.map((u) => ({
    id: u._id.toString(),
    name: pickName(u, lang),
    nameEn: pickName(u, "en"),
    nameAr: pickName(u, "ar"),
    email: u.email,
    avatarUrl: u.avatarUrl || "",
    role: u.role,
    department: idStr(u.department),
    branch: idStr(u.branch),
    badgeId: u.badgeId || "",
    status: u.status,
    contractStart: u.contractStart || "",
    contractEnd: u.contractEnd || "",
    annualLeaveDays: u.annualLeaveDays ?? 21,
    kpiExcluded: Boolean(u.kpiExcluded),
    workSchedule: u.workSchedule?.custom ? u.workSchedule : null,
    // Department heads: share of their KPI that's management (null = the company default).
    managementShare: Number.isFinite(u.managementShare) ? u.managementShare : null,
    // Owners are not scored against their own staff unless included explicitly.
    excluded: Boolean(u.kpiExcluded) || ["gm", "ceo", "coder"].includes(u.role),
    // GM / CEO: no attendance requirement; fixed monthly salary.
    attendanceExempt: ["gm", "ceo", "coder"].includes(u.role),
  }));
}

// Company working hours with an employee's personal schedule on top (empty fields
// keep the company value). Personal start / end / hours apply to every working day;
// the company's special days still apply.
export function personalWorkHours(company, schedule) {
  if (!schedule?.custom) return company;
  const out = { ...company };
  for (const f of ["workStart", "workEnd"]) if (schedule[f]) out[f] = schedule[f];
  for (const f of ["dailyHours", "ramadanHours", "minHours", "graceMinutes"]) {
    if (typeof schedule[f] === "number" && Number.isFinite(schedule[f])) out[f] = schedule[f];
  }
  out.days = Array.from({ length: 7 }, (_, wd) => {
    const day = weekdayHours(company, wd);
    return {
      start: schedule.workStart || day.start,
      end: schedule.workEnd || day.end,
      hours: typeof schedule.dailyHours === "number" && Number.isFinite(schedule.dailyHours) ? schedule.dailyHours : day.hours,
    };
  });
  return out;
}

export async function salaryFor(userIds, month) {
  const lastDay = monthDays(month).at(-1);
  const rows = await SalaryHistory.find({ user: { $in: userIds }, from: { $lte: lastDay } }).sort({ from: -1 }).lean();
  const out = {};
  for (const r of rows) {
    const uid = r.user.toString();
    if (!out[uid]) out[uid] = { amount: r.amount, currency: r.currency, from: r.from };
  }
  return out;
}

// Attendance for a set of staff in one month (live calculation).
export async function attendanceForMonth(staff, month, settings) {
  const { start, end } = monthRange(month);
  const days = monthDays(month);
  const badges = staff.map((s) => s.badgeId).filter(Boolean);
  const ids = staff.map((s) => s.id);

  const [punches, overrides, leaves, overtime] = await Promise.all([
    RawPunch.find({ badgeId: { $in: badges }, time: { $gte: start, $lt: end } }, { badgeId: 1, time: 1 }).lean(),
    AttendanceOverride.find({ user: { $in: ids }, date: { $gte: days[0], $lte: days.at(-1) } }).lean(),
    LeaveRequest.find({ user: { $in: ids }, status: "approved", from: { $lte: days.at(-1) }, to: { $gte: days[0] } }).lean(),
    // Overtime only counts on days with an approved request (lib/overtime.js).
    OvertimeRequest.find({ user: { $in: ids }, status: "approved", date: { $gte: days[0], $lte: days.at(-1) } }, { user: 1, date: 1, approvedHours: 1 }).lean(),
  ]);

  const today = todayIn(settings.hr.timezone);
  const out = {};
  for (const s of staff) {
    out[s.id] = computeAttendance({
      user: s,
      month,
      punches: s.badgeId ? punches.filter((p) => p.badgeId === s.badgeId).map((p) => p.time) : [],
      overrides: overrides.filter((o) => o.user.toString() === s.id),
      leaves: leaves.filter((l) => l.user.toString() === s.id),
      overtimeApproved: overtime.filter((o) => o.user.toString() === s.id).map((o) => ({ date: o.date, hours: o.approvedHours })),
      settings: s.workSchedule ? { ...settings, workHours: personalWorkHours(settings.workHours, s.workSchedule) } : settings,
      today,
    });
  }
  return out;
}

// Actual working hours: every task the employee handed in (approved, done, or waiting
// for its reviews — the GM's or the customer's can come after the month closes) adds
// its hours in the month it was handed in: the project-scale hours, else the estimate,
// else the time tracked. Big multi-day tasks count in full once handed in. Work the GM /
// CEO cancelled adds the time actually spent on it (lib/kpi/engine creditHours).
const CREDIT_KINDS = ["task", "revision", "help", "meeting"];
export const taskCreditHours = (t) => t.maxHours || t.estimatedHours || (t.activeMs || 0) / 3600000;
export function actualHoursBy(tasks) {
  const out = {};
  for (const t of tasks) {
    if (!CREDIT_KINDS.includes(t.kind)) continue;
    const hours = creditHours(t);
    if (!hours) continue;
    const id = t.assignee.toString();
    out[id] = (out[id] || 0) + hours;
  }
  return out;
}

// Adds actualHours (finished tasks + sick-day hours) and efficiency (actual ÷ worked
// hours) to attendance summaries.
export function withActualHours(attendance, tasks) {
  const actual = actualHoursBy(tasks);
  for (const [id, a] of Object.entries(attendance)) {
    a.summary.actualHours = Math.round(((actual[id] || 0) + (a.summary.sickHours || 0)) * 100) / 100;
    a.summary.efficiency = a.summary.workedHours ? Math.round((a.summary.actualHours / a.summary.workedHours) * 1000) / 1000 : null;
  }
  return attendance;
}

// Tasks handed in during the month (in the HR time zone), for KPI and actual hours,
// plus work cancelled during the month after it started (its time counts).
export async function tasksForMonth(month, userIds, tz) {
  const { start, end } = monthRange(month);
  const tasks = await Task.find(
    {
      assignee: { $in: userIds },
      $or: [
        { submittedAt: { $gte: start, $lt: end }, status: { $ne: "cancelled" } },
        { status: "cancelled", cancelledAt: { $gte: start, $lt: end }, activeMs: { $gt: 0 } },
      ],
    },
    {
      assignee: 1, kind: 1, status: 1, revision: 1, dueAt: 1, submittedAt: 1, activeMs: 1, ratings: 1, type: 1, maxHours: 1, estimatedHours: 1,
      // Reject causes, review levels and reviews: fair quality metrics and the department heads' review speed.
      rejectCause: 1, revisionCause: 1, reviewLevel: 1, reviews: 1, reviewedBy: 1, reviewedAt: 1, cancelledAt: 1,
    }
  ).lean();
  return tasks.filter((t) => localParts(t.status === "cancelled" ? t.cancelledAt : t.submittedAt, tz).date.startsWith(month));
}

// A stored KpiResult in the shape computeMonth gives its rows.
function storedKpi(k) {
  return {
    score: k.total,
    systemScore: k.systemScore ?? k.total,
    manualScore: k.manualScore ?? null,
    hybrid: k.hybrid ?? null,
    grade: k.grade,
    rank: k.rank,
    of: k.of,
    indicators: k.indicators || [],
    bonus: k.bonus || 0,
    legacy: Boolean(k.legacy),
  };
}

export async function hrMonthState(month) {
  return (await HrMonth.findOne({ month }).lean()) || { month, bonusPool: 0, bonusCurrency: "USD", bonusSplit: [], bonusMinScore: 0, bonusNote: "", closed: false };
}

/**
 * Full month for all staff: attendance, KPI, payroll. Closed months come from the
 * frozen snapshots; open months are calculated live.
 */
export async function computeMonth(month, { staff: givenStaff } = {}) {
  const [settings, state, staff] = await Promise.all([
    getSettings(),
    hrMonthState(month),
    givenStaff || hrStaff({ status: "active" }),
  ]);
  const ids = staff.map((s) => s.id);

  if (state.closed) {
    const [payroll, kpi] = await Promise.all([
      PayrollRecord.find({ month, user: { $in: ids } }).lean(),
      KpiResult.find({ month, user: { $in: ids } }).lean(),
    ]);
    const payBy = Object.fromEntries(payroll.map((p) => [p.user.toString(), p]));
    const kpiBy = Object.fromEntries(kpi.map((k) => [k.user.toString(), k]));
    return {
      month,
      state,
      settings,
      rows: staff.map((s) => ({
        staff: s,
        attendance: payBy[s.id]?.attendance || null,
        payroll: payBy[s.id]?.payroll || null,
        kpi: kpiBy[s.id] ? storedKpi(kpiBy[s.id]) : null,
      })),
      departments: {},
    };
  }

  const [attendance, salaries, tasks] = await Promise.all([
    attendanceForMonth(staff, month, settings),
    salaryFor(ids, month),
    tasksForMonth(month, ids, settings.hr.timezone),
  ]);
  withActualHours(attendance, tasks);
  const summaries = Object.fromEntries(Object.entries(attendance).map(([k, v]) => [k, v.summary]));
  // Department managers are always scored (attendance is mandatory for them) with the
  // hybrid KPI: their team's results and the GM / CEO rating, and their own work.
  const [managerRoles, ratings] = await Promise.all([managerRoleKeys(), ManagerRating.find({ month, user: { $in: ids } }).lean()]);
  const criteria = settings.managerKpi?.criteria || [];
  const manualScores = {};
  for (const r of ratings) {
    const pct = ratingPercent(r, criteria);
    if (pct !== null) manualScores[r.user.toString()] = pct;
  }
  const kpi = computeKpi({
    users: staff.map((s) => ({
      ...s,
      excluded: managerRoles.includes(s.role) ? !summaries[s.id]?.requiredHours : s.excluded || !summaries[s.id]?.requiredHours,
    })),
    manualScores,
    managers: Object.fromEntries(staff.filter((s) => managerRoles.includes(s.role)).map((s) => [s.id, { share: s.managementShare ?? null }])),
    hybrid: {
      share: settings.managerKpi?.managementShare,
      ratingWeight: settings.managerKpi?.ratingWeight,
      teamWeights: settings.managerKpi?.teamWeights,
    },
    attendance: summaries,
    tasks,
    config: kpiConfigFor(settings.kpi, month),
    ratingTags: settings.tasks.ratingTags,
    bonusPool: state.bonusPool,
    bonusSplit: state.bonusSplit?.length ? state.bonusSplit : settings.hr.bonusSplit,
    bonusMinScore: state.bonusMinScore || 0,
  });
  let kpiBy = Object.fromEntries(kpi.results.map((r) => [r.userId, r]));
  // A month the old Excel program already scored (imported from its KPI archive,
  // scripts/legacy) keeps those scores: they're what was announced and paid then.
  const archived = await KpiResult.find({ month, legacy: true, user: { $in: ids } }).lean();
  if (archived.length) kpiBy = Object.fromEntries(archived.map((k) => [k.user.toString(), storedKpi(k)]));

  return {
    month,
    state,
    settings,
    departments: kpi.departments,
    target: kpi.target,
    rows: staff.map((s) => ({
      staff: s,
      attendance: attendance[s.id],
      kpi: kpiBy[s.id] || null,
      payroll: computePayroll({
        salary: salaries[s.id],
        summary: attendance[s.id].summary,
        settings,
        kpiBonus: kpiBy[s.id]?.bonus || 0,
        fixed: s.attendanceExempt,
      }),
    })),
  };
}

// Freeze attendance, payroll and KPI of a month.
export async function closeMonth(month, actorId) {
  const state = await hrMonthState(month);
  if (state.closed) return { error: "month_closed" };
  const data = await computeMonth(month);
  // Re-run payroll with the full month's requirement now that it's final.
  for (const row of data.rows) {
    const salary = (await salaryFor([row.staff.id], month))[row.staff.id];
    row.payroll = computePayroll({ salary, summary: row.attendance.summary, settings: data.settings, kpiBonus: row.kpi?.bonus || 0, closed: true, fixed: row.staff.attendanceExempt });
  }

  await PayrollRecord.deleteMany({ month });
  // The Excel archive's scores stay as they are (see computeMonth).
  await KpiResult.deleteMany({ month, legacy: { $ne: true } });
  await PayrollRecord.insertMany(
    data.rows.map((r) => ({ user: r.staff.id, month, attendance: r.attendance, payroll: r.payroll }))
  );
  await KpiResult.insertMany(
    data.rows
      .filter((r) => r.kpi && !r.kpi.legacy)
      .map((r) => ({
        user: r.staff.id,
        month,
        total: r.kpi.score,
        systemScore: r.kpi.systemScore,
        manualScore: r.kpi.manualScore,
        hybrid: r.kpi.hybrid || null,
        grade: r.kpi.grade,
        rank: r.kpi.rank,
        of: r.kpi.of,
        indicators: r.kpi.indicators,
        bonus: r.kpi.bonus,
      }))
  );
  await HrMonth.findOneAndUpdate(
    { month },
    { month, closed: true, closedAt: new Date(), closedBy: actorId },
    { upsert: true }
  );
  return { ok: true, count: data.rows.length };
}

export async function reopenMonth(month) {
  await PayrollRecord.deleteMany({ month });
  await KpiResult.deleteMany({ month, legacy: { $ne: true } });
  await HrMonth.findOneAndUpdate({ month }, { closed: false, closedAt: null, closedBy: null }, { upsert: true });
  return { ok: true };
}

// Annual-leave balance for the contract year (approved + pending annual leave this year).
export async function leaveBalance(user, year) {
  const taken = await LeaveRequest.find({
    user: user.id,
    type: "annual",
    status: { $in: ["approved", "pending"] },
    from: { $gte: `${year}-01-01`, $lte: `${year}-12-31` },
  }).lean();
  const used = taken.filter((l) => l.status === "approved").reduce((a, l) => a + l.days, 0);
  const pending = taken.filter((l) => l.status === "pending").reduce((a, l) => a + l.days, 0);
  return { total: user.annualLeaveDays ?? 21, used, pending, remaining: (user.annualLeaveDays ?? 21) - used };
}
