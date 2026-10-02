// Attendance engine: raw punches + calendar + leave + HR overrides → days & month summary.
// Pure functions (no database) so they can be tested with the Excel numbers.

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

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || "00:00").split(":").map(Number);
  return h * 60 + (m || 0);
};

const weekday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

// Working days of a leave request (weekends and holidays excluded).
export function leaveWorkingDays(from, to, calendar) {
  if (!from || !to || to < from) return 0;
  let n = 0;
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (!calendar.weekend.includes(d.getUTCDay()) && !calendar.holidays.some((h) => h.date === iso)) n += 1;
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
 */
export function computeAttendance({ user = {}, month, punches, overrides = [], leaves = [], settings, today }) {
  const { calendar, workHours, hr } = settings;
  const tz = hr.timezone || "Asia/Damascus";
  const workStart = toMinutes(workHours.workStart);

  const byDay = {};
  for (const p of punches) {
    const lp = localParts(new Date(p), tz);
    if (lp.date.startsWith(month)) (byDay[lp.date] ||= []).push({ at: new Date(p), minutes: lp.minutes });
  }
  const overrideOf = Object.fromEntries(overrides.map((o) => [o.date, o]));

  const days = monthDays(month).map((date) => {
    const isWeekend = calendar.weekend.includes(weekday(date));
    const holiday = calendar.holidays.find((h) => h.date === date);
    const ramadan = calendar.ramadan?.start && calendar.ramadan?.end && date >= calendar.ramadan.start && date <= calendar.ramadan.end;
    let required = isWeekend || holiday ? 0 : ramadan ? workHours.ramadanHours : workHours.dailyHours;

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

    // Hours that count toward the month: worked time (up to the day's requirement),
    // paid leave, or a day HR marked present without punches.
    let credited = 0;
    if (status === "present") credited = checkIn ? Math.min(total, required) : required;
    else if (PAID.includes(status)) credited = required;

    const lateMinutes =
      status === "present" && checkIn && required > 0 ? Math.max(0, checkIn.minutes - (workStart + workHours.graceMinutes)) : 0;
    const overtime = status === "present" && checkIn && checkOut ? Math.max(0, total - required) : 0;
    const shortage = status === "present" && checkIn && required > 0 ? Math.max(0, required - total) : 0;

    const warnings = [];
    if (!override?.exemptWarnings) {
      if (lateMinutes > 0 && hr.lateIsWarning) warnings.push("late");
      if (status === "present" && checkIn && checkOut && required > 0 && total < workHours.minHours && hr.shortageIsWarning) {
        warnings.push("shortage");
      }
      if (status === "absent" && hr.absenceIsWarning) warnings.push("absent_unjustified");
    }

    return {
      date,
      weekday: weekday(date),
      status,
      ramadan: Boolean(ramadan),
      holidayName: holiday?.name || null,
      checkIn: checkIn?.at.toISOString() || null,
      checkOut: checkOut?.at.toISOString() || null,
      missingCheckOut: Boolean(checkIn && !checkOut && date < today),
      punches: list.length,
      required,
      total: round(total),
      credited: round(credited),
      overtime: round(overtime),
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
  const summary = {
    month,
    requiredHours: sum(days, "required"),
    requiredToDate: sum(past, "required"),
    creditedHours: sum(days, "credited"),
    workedHours: sum(days, "total"),
    overtimeHours: sum(days, "overtime"),
    shortageHours: sum(days, "shortage"),
    presentDays: days.filter((d) => d.status === "present").length,
    absentDays: days.filter((d) => d.status === "absent").length,
    leaveDays: days.filter((d) => d.status.endsWith("_leave")).length,
    lateCount: days.filter((d) => d.lateMinutes > 0).length,
    warnings: days.reduce((a, d) => a + d.warnings.length, 0),
    missingCheckOuts: days.filter((d) => d.missingCheckOut).length,
    manualBonus: days.reduce((a, d) => a + d.bonus, 0),
  };
  summary.efficiency = summary.requiredToDate ? round(summary.creditedHours / summary.requiredToDate, 3) : null;
  summary.shortHours = round(Math.max(0, summary.requiredToDate - summary.creditedHours));

  return { days, summary };
}

// Payslip lines from an attendance summary. Amounts are in the salary currency.
export function computePayroll({ salary, summary, settings, kpiBonus = 0, closed = false }) {
  const { hr, workHours } = settings;
  const base = salary?.amount || 0;
  const monthHours = summary.requiredHours || workHours.monthlyRequiredHours;
  const hourlyRate = monthHours ? base / monthHours : 0;
  const required = closed ? summary.requiredHours : summary.requiredToDate;

  const missingHours = Math.max(0, required - summary.creditedHours);
  const hoursDeduction = hr.deductMissingHours ? missingHours * hourlyRate : 0;
  const rule = [...hr.warningRules].sort((a, b) => b.count - a.count).find((r) => summary.warnings >= r.count);
  const warningPercent = rule ? rule.percent : 0;
  const warningDeduction = (base * warningPercent) / 100;
  const overtimePay = hr.payOvertime ? summary.overtimeHours * hourlyRate * workHours.overtimeMultiplier : 0;
  const bonus = summary.manualBonus + kpiBonus;
  const net = Math.max(0, base - hoursDeduction - warningDeduction + overtimePay + bonus);

  return {
    currency: salary?.currency || "USD",
    base: round(base, 2),
    hourlyRate: round(hourlyRate, 4),
    missingHours: round(missingHours),
    hoursDeduction: round(hoursDeduction, 2),
    warnings: summary.warnings,
    warningPercent,
    warningDeduction: round(warningDeduction, 2),
    overtimeHours: summary.overtimeHours,
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
