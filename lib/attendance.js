// Attendance engine: raw punches + calendar + leave + HR overrides → days & month summary.
// Pure functions (no database) so they can be tested with the Excel numbers.

import { daySchedule, monthWorkHours } from "./workDays.js";

export const DAY_STATUSES = [
  "present",
  "absent",
  "weekend",
  "holiday",
  "annual_leave",
  "sick_leave",
  "unpaid_leave",
  "justified_absence",
  "upcoming",
  "not_employed",
];
// Statuses HR can force on a day (tbl_ManualOverrides).
export const OVERRIDE_STATUSES = ["present", "absent", "justified_absence", "annual_leave", "sick_leave", "unpaid_leave", "holiday", "weekend"];
const PAID = ["annual_leave", "sick_leave", "holiday"];
// Days not worked and not paid: each costs exactly that day's salary (its hours), which
// overtime on other days doesn't make up for. Unjustified absence also gives a warning.
const UNPAID = ["absent", "justified_absence", "unpaid_leave"];

const pad = (n) => String(n).padStart(2, "0");

export function monthDays(month) {
  const [y, m] = month.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${pad(i + 1)}`);
}

export function currentMonth(tz) {
  return localParts(new Date(), tz).date.slice(0, 7);
}

// Local date "YYYY-MM-DD" and minutes after midnight of an instant in a time zone.
export function localParts(date, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: hour * 60 + Number(parts.minute) };
}

// The instant of an office-time date "YYYY-MM-DD" and time "HH:MM[:SS]" in a time zone
// (the inverse of localParts). Null when they aren't valid.
export function fromLocal(date, time, tz) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !/^\d{1,2}:\d{2}(:\d{2})?$/.test(String(time))) return null;
  const [h, m, s = "0"] = String(time).split(":");
  const naive = Date.parse(`${date}T${h.padStart(2, "0")}:${m}:${s.padStart(2, "0")}Z`);
  if (Number.isNaN(naive)) return null;
  const offset = (ms) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
        .formatToParts(new Date(ms))
        .map((x) => [x.type, x.value])
    );
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
  };
  const first = naive - offset(naive);
  return new Date(naive - offset(first)); // right side of a DST change
}

const weekday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

// Working days of a leave request (days off excluded, special working days included).
export function leaveWorkingDays(from, to, calendar, workHours = {}) {
  if (!from || !to || to < from) return 0;
  let n = 0;
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    if (daySchedule(d.toISOString().slice(0, 10), calendar, workHours).working) n += 1;
  }
  return n;
}

/**
 * @param user      { contractStart, contractEnd }
 * @param month     "YYYY-MM"
 * @param punches   [Date]  this employee's punches (any order)
 * @param overrides [{ date, status, exemptWarnings, bonus, note }]
 * @param leaves    approved [{ type, from, to }]
 * @param settings  { calendar, workHours, hr }
 * @param today     "YYYY-MM-DD" in the HR time zone
 * @param overtimeApproved [{ date, hours }] the approved overtime requests. Overtime only
 *                  counts on a day with an approved request, up to its approved hours
 *                  (extra time without one still makes up for short days of the month).
 *                  Not given (older callers, tests): every extra hour counts as before.
 */
export function computeAttendance({ user = {}, month, punches, overrides = [], leaves = [], settings, today, overtimeApproved }) {
  const approvalNeeded = Array.isArray(overtimeApproved);
  const approvedOn = {};
  for (const a of overtimeApproved || []) approvedOn[a.date] = (approvedOn[a.date] || 0) + (Number(a.hours) || 0);
  const { calendar, workHours, hr } = settings;
  const tz = hr.timezone || "Asia/Damascus";

  const byDay = {};
  for (const p of punches) {
    const lp = localParts(new Date(p), tz);
    if (lp.date.startsWith(month)) (byDay[lp.date] ||= []).push({ at: new Date(p), minutes: lp.minutes });
  }
  const overrideOf = Object.fromEntries(overrides.map((o) => [o.date, o]));

  const days = monthDays(month).map((date) => {
    // Each day has its own hours and start time (Settings → Working hours).
    const sched = daySchedule(date, calendar, workHours);
    const isWeekend = sched.off === "weekend" || (!sched.working && !sched.off);
    const holiday = sched.off === "holiday" ? sched.holiday : null;
    const ramadan = sched.ramadan;
    let required = sched.hours;

    const list = (byDay[date] || []).sort((a, b) => a.at - b.at);
    const checkIn = list[0] || null;
    const checkOut = list.length > 1 ? list[list.length - 1] : null;
    const total = checkIn && checkOut ? (checkOut.at - checkIn.at) / 3600000 : 0;
    const leave = leaves.find((l) => date >= l.from && date <= l.to);
    const override = overrideOf[date];
    const employed = (!user.contractStart || date >= user.contractStart) && (!user.contractEnd || date <= user.contractEnd);

    let status;
    if (!employed) status = "not_employed";
    else if (override?.status) status = override.status;
    else if (checkIn) status = "present";
    else if (holiday) status = "holiday";
    else if (isWeekend) status = "weekend";
    else if (leave) status = `${leave.type}_leave`;
    else if (date >= today) status = "upcoming";
    else status = "absent";

    if (status === "not_employed" || status === "weekend" || status === "holiday") required = 0;
    // GM / CEO: no attendance requirement — nothing is required, missing or late.
    if (user.attendanceExempt) {
      required = 0;
      if (status === "absent" || status === "upcoming") status = "exempt";
    }

    // Hours that count toward the month: worked time (up to the day's requirement),
    // paid leave, or a day HR marked present without punches.
    let credited = 0;
    if (status === "present") credited = checkIn ? Math.min(total, required) : required;
    else if (PAID.includes(status)) credited = required;
    // All hours the day adds to the month (worked time in full, paid leave, HR "present").
    // The month's overtime / missing hours compare this total with the required hours.
    let counted = 0;
    if (status === "present") counted = checkIn ? total : required;
    else if (PAID.includes(status)) counted = required;

    const lateMinutes =
      status === "present" && checkIn && required > 0 ? Math.max(0, checkIn.minutes - (sched.startMin + workHours.graceMinutes)) : 0;
    const extra = status === "present" && checkIn && checkOut ? Math.max(0, total - required) : 0;
    // Overtime of the day: approved by the manager (up to the approved hours), or —
    // without the approval rule — every extra hour.
    const overtime = approvalNeeded ? Math.min(extra, approvedOn[date] || 0) : extra;
    const shortage = status === "present" && checkIn && required > 0 ? Math.max(0, required - total) : 0;

    const warnings = [];
    if (!override?.exemptWarnings) {
      if (lateMinutes > 0 && hr.lateIsWarning) warnings.push("late");
      if (status === "present" && checkIn && checkOut && required > 0 && total < Math.min(workHours.minHours, required) && hr.shortageIsWarning) {
        warnings.push("shortage");
      }
      if (status === "absent" && hr.absenceIsWarning) warnings.push("absent_unjustified");
    }

    return {
      date,
      weekday: weekday(date),
      status,
      ramadan: Boolean(ramadan),
      specialDay: Boolean(sched.special),
      holidayName: holiday?.name || null,
      checkIn: checkIn?.at.toISOString() || null,
      checkOut: checkOut?.at.toISOString() || null,
      missingCheckOut: Boolean(checkIn && !checkOut && date < today),
      punches: list.length,
      required,
      total: round(total),
      credited: round(credited),
      counted: round(counted),
      overtime: round(overtime),
      // Worked beyond the day's hours without an approved overtime request.
      unapprovedOvertime: round(extra - overtime),
      shortage: round(shortage),
      lateMinutes,
      activity: required > 0 && status === "present" ? round(total / required, 3) : null,
      warnings,
      exempt: Boolean(override?.exemptWarnings),
      bonus: override?.bonus || 0,
      note: override?.note || "",
      overridden: Boolean(override?.status),
    };
  });

  // "To date" figures only count days that have happened, so an open month isn't
  // penalised for the future.
  const past = days.filter((d) => d.date < today || (d.date === today && d.status === "present"));
  const sum = (list, field) => round(list.reduce((a, d) => a + d[field], 0));
  // A sick day (approved sick leave, or HR marks it) counts as a full normal day: its
  // required hours are added to the worked hours and to the actual (task) hours.
  const sickHours = sum(past.filter((d) => d.status === "sick_leave"), "required");
  // Overtime is monthly: only the hours above the month's required total, so a long day
  // first makes up for a short one. Before the month ends it compares with "to date".
  const overallHours = sum(days, "counted");
  const overallToDate = sum(past, "counted");
  const requiredToDate = sum(past, "required");
  // Unpaid days are deducted on their own, so overtime and missing hours only compare
  // the days that were worked (or paid).
  const unpaid = past.filter((d) => UNPAID.includes(d.status));
  const unpaidHours = sum(unpaid, "required");
  const workedRequired = requiredToDate - unpaidHours;
  const summary = {
    month,
    requiredHours: sum(days, "required"),
    requiredToDate,
    creditedHours: sum(days, "credited"),
    overallHours,
    overallToDate,
    workedHours: round(sum(days, "total") + sickHours),
    sickHours,
    // The month's extra hours, but only as much as the approved overtime of its days.
    overtimeHours: user.attendanceExempt
      ? 0
      : round(Math.min(Math.max(0, overallToDate - workedRequired), approvalNeeded ? sum(past, "overtime") : Infinity)),
    // The cap for the payslip (null = no approval rule).
    approvedOvertimeHours: approvalNeeded ? (user.attendanceExempt ? 0 : sum(days, "overtime")) : null,
    unapprovedOvertimeHours: sum(past, "unapprovedOvertime"),
    missingHours: round(Math.max(0, workedRequired - overallToDate)),
    unpaidHours,
    unpaidDays: unpaid.length,
    shortageHours: sum(days, "shortage"),
    presentDays: days.filter((d) => d.status === "present").length,
    absentDays: days.filter((d) => d.status === "absent").length,
    leaveDays: days.filter((d) => d.status.endsWith("_leave")).length,
    lateCount: days.filter((d) => d.lateMinutes > 0).length,
    warnings: days.reduce((a, d) => a + d.warnings.length, 0),
    missingCheckOuts: days.filter((d) => d.missingCheckOut).length,
    manualBonus: days.reduce((a, d) => a + d.bonus, 0),
  };
  // Actual hours (finished tasks) and efficiency are filled in by computeMonth / withActualHours.
  summary.actualHours = 0;
  summary.efficiency = null;
  summary.shortHours = round(Math.max(0, summary.requiredToDate - summary.creditedHours));

  return { days, summary };
}

// Payslip lines from an attendance summary. Amounts are in the salary currency.
// `fixed` (GM / CEO): the base salary every month — no attendance deductions or overtime.
export function computePayroll({ salary, summary, settings, kpiBonus = 0, closed = false, fixed = false }) {
  const { hr, workHours } = settings;
  const base = salary?.amount || 0;
  if (fixed) {
    return {
      currency: salary?.currency || "USD",
      base: round(base, 2),
      hourlyRate: 0,
      missingHours: 0,
      hoursDeduction: 0,
      warnings: 0,
      warningPercent: 0,
      warningDeduction: 0,
      overtimeHours: 0,
      overtimePay: 0,
      manualBonus: round(summary.manualBonus, 2),
      kpiBonus: round(kpiBonus, 2),
      net: round(base + summary.manualBonus + kpiBonus, 2),
      hasSalary: Boolean(salary),
      fixed: true,
    };
  }
  // Nothing required (e.g. not employed all month): the company month from the day table.
  const monthHours = summary.requiredHours || (summary.month && settings.calendar ? monthWorkHours(summary.month, settings) : 0) || workHours.monthlyRequiredHours;
  const hourlyRate = monthHours ? base / monthHours : 0;
  // Month total against the month's required hours (to date while the month is open):
  // below = missing hours deducted, above = overtime paid × the overtime multiplier.
  // An unpaid day (absence, unpaid leave) costs exactly its own hours; the rest of the
  // month compares the hours worked with the hours of the days that were worked.
  const unpaidHours = summary.unpaidHours || 0;
  const absenceDeduction = unpaidHours * hourlyRate;
  const required = (closed ? summary.requiredHours : summary.requiredToDate) - unpaidHours;
  const overall = closed ? (summary.overallHours ?? summary.creditedHours) : (summary.overallToDate ?? summary.creditedHours);
  const missingHours = Math.max(0, required - overall);
  // Only approved overtime is paid (lib/overtime.js): no more than the approved hours.
  const cap = summary.approvedOvertimeHours ?? Infinity;
  const overtimeHours = Math.min(Math.max(0, overall - required), cap);
  const hoursDeduction = hr.deductMissingHours ? missingHours * hourlyRate : 0;
  const rule = [...hr.warningRules].sort((a, b) => b.count - a.count).find((r) => summary.warnings >= r.count);
  const warningPercent = rule ? rule.percent : 0;
  const warningDeduction = (base * warningPercent) / 100;
  const overtimePay = hr.payOvertime ? overtimeHours * hourlyRate * workHours.overtimeMultiplier : 0;
  const bonus = summary.manualBonus + kpiBonus;
  const net = Math.max(0, base - absenceDeduction - hoursDeduction - warningDeduction + overtimePay + bonus);

  return {
    currency: salary?.currency || "USD",
    base: round(base, 2),
    hourlyRate: round(hourlyRate, 4),
    absentDays: summary.unpaidDays || 0,
    absentHours: round(unpaidHours),
    absenceDeduction: round(absenceDeduction, 2),
    missingHours: round(missingHours),
    hoursDeduction: round(hoursDeduction, 2),
    warnings: summary.warnings,
    warningPercent,
    warningDeduction: round(warningDeduction, 2),
    overtimeHours: round(overtimeHours),
    overtimePay: round(overtimePay, 2),
    manualBonus: round(summary.manualBonus, 2),
    kpiBonus: round(kpiBonus, 2),
    net: round(net, 2),
    hasSalary: Boolean(salary),
  };
}

function round(n, digits = 2) {
  const f = 10 ** digits;
  return Math.round((n + Number.EPSILON) * f) / f;
}
