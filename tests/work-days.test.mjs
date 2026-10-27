import { computeAttendance, computePayroll, leaveWorkingDays } from "../lib/attendance.js";
import { addWorkHours, makeCalendar } from "../lib/gantt.js";
import { daySchedule, monthWorkHours } from "../lib/workDays.js";

let fails = 0;
const ok = (name, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"} ${name} ${c ? "" : x}`); if (!c) fails++; };

// Sun–Wed 09–17 (8h), Thursday short 09–14 (5h), Saturday 10–16 (6h), Friday off.
const days = Array.from({ length: 7 }, () => ({ start: "09:00", end: "17:00", hours: 8 }));
days[4] = { start: "09:00", end: "14:00", hours: 5 };
days[6] = { start: "10:00", end: "16:00", hours: 6 };
const settings = {
  calendar: { weekend: [5], holidays: [{ date: "2026-09-23", name: { ar: "", en: "" } }], ramadan: { start: "", end: "" } },
  workHours: {
    workStart: "09:00", workEnd: "17:00", dailyHours: 8, ramadanHours: 7, minHours: 7.5, graceMinutes: 15, overtimeMultiplier: 1.5, monthlyRequiredHours: 208,
    days,
    // A working Friday, and a 4-hour day on the holiday.
    special: [{ date: "2026-09-11", start: "09:00", end: "13:00", hours: 4 }, { date: "2026-09-30", start: "12:00", end: "15:00", hours: 3 }],
  },
  hr: { timezone: "Asia/Damascus", lateIsWarning: true, shortageIsWarning: true, absenceIsWarning: true, warningRules: [], deductMissingHours: true, payOvertime: true, bonusSplit: [50, 30, 20] },
};

ok("thursday counts 5h", daySchedule("2026-09-03", settings.calendar, settings.workHours).hours === 5);
ok("friday off", daySchedule("2026-09-04", settings.calendar, settings.workHours).off === "weekend");
ok("special friday is a 4h working day", daySchedule("2026-09-11", settings.calendar, settings.workHours).hours === 4);
ok("holiday off", daySchedule("2026-09-23", settings.calendar, settings.workHours).off === "holiday");
ok("legacy settings (no days) use the standard day", daySchedule("2026-09-03", settings.calendar, { workStart: "08:00", workEnd: "15:00", dailyHours: 7 }).hours === 7);
ok("ramadan caps the day", daySchedule("2026-09-01", { ...settings.calendar, ramadan: { start: "2026-09-01", end: "2026-09-02" } }, settings.workHours).hours === 7);

// September 2026: 30 days; Fridays 4,11,18,25; holiday 23 (Wed); Thursdays 3,10,17,24; Saturdays 5,12,19,26.
// Sun–Wed = 18 days − holiday 23rd − special 30th (3h) = 16 × 8 + 3 = 131, Thu 4 × 5 = 20, Sat 4 × 6 = 24, special Fri 4.
ok("month hours follow each day", monthWorkHours("2026-09", settings) === 131 + 20 + 24 + 4, monthWorkHours("2026-09", settings));
ok("leave days skip Friday, count the special Friday", leaveWorkingDays("2026-09-03", "2026-09-12", settings.calendar, settings.workHours) === 9);

const p = (date, hm) => new Date(`${date}T${hm}:00+03:00`);
const { days: att, summary } = computeAttendance({
  user: {}, month: "2026-09",
  punches: [p("2026-09-03", "09:00"), p("2026-09-03", "14:00"), p("2026-09-05", "10:10"), p("2026-09-05", "16:00"), p("2026-09-11", "09:00"), p("2026-09-11", "13:00")],
  settings, today: "2026-10-01",
});
const d = Object.fromEntries(att.map((x) => [x.date, x]));
ok("short thursday: 5h required, no shortage warning", d["2026-09-03"].required === 5 && d["2026-09-03"].shortage === 0 && !d["2026-09-03"].warnings.includes("shortage"), JSON.stringify(d["2026-09-03"]));
ok("saturday starts 10:00: 10:10 is within grace", d["2026-09-05"].required === 6 && d["2026-09-05"].lateMinutes === 0, JSON.stringify(d["2026-09-05"]));
ok("special friday worked", d["2026-09-11"].status === "present" && d["2026-09-11"].required === 4 && d["2026-09-11"].specialDay);
ok("month requirement = sum of each day", summary.requiredHours === 179, summary.requiredHours);

// Gantt: 8h starting Thursday 09:00 = 5h Thu, Fri off, 3h Sat (10:00–13:00).
const cal = makeCalendar(settings);
const end = addWorkHours(p("2026-09-03", "09:00").getTime(), 8, cal);
ok("gantt follows each day's hours", end === p("2026-09-05", "13:00").getTime(), new Date(end).toISOString());

// Overtime is monthly: a long day first makes up for a short one.
const week = { ...settings, workHours: { ...settings.workHours, special: [] } };
const short = computeAttendance({
  user: {}, month: "2026-09",
  // Tue 1st 6h (−2), Wed 2nd 10h (+2), Thu 3rd 5h — exactly the 21h required to date.
  punches: [p("2026-09-01", "09:00"), p("2026-09-01", "15:00"), p("2026-09-02", "09:00"), p("2026-09-02", "19:00"), p("2026-09-03", "09:00"), p("2026-09-03", "14:00")],
  settings: week, today: "2026-09-04",
}).summary;
ok("−2h and +2h cancel out: no overtime, nothing missing", short.requiredToDate === 21 && short.overtimeHours === 0 && short.missingHours === 0, JSON.stringify(short));
const sp = computePayroll({ salary: { amount: 1000 }, summary: short, settings: week });
ok("payroll: no deduction, no overtime pay", sp.hoursDeduction === 0 && sp.overtimePay === 0, JSON.stringify(sp));

const extra = computeAttendance({
  user: {}, month: "2026-09",
  punches: [p("2026-09-01", "09:00"), p("2026-09-01", "20:00"), p("2026-09-02", "09:00"), p("2026-09-02", "17:00"), p("2026-09-03", "09:00"), p("2026-09-03", "14:00")],
  settings: week, today: "2026-09-04",
}).summary;
const ep = computePayroll({ salary: { amount: 1000 }, summary: extra, settings: week });
// 11 + 8 + 5 = 24h against 21h → 3h × (1000 / month hours) × 1.5.
ok("3h above the month → overtime", extra.overtimeHours === 3 && ep.overtimeHours === 3, JSON.stringify(extra));
ok("overtime pay = hours × hourly rate × multiplier", Math.abs(ep.overtimePay - 3 * (1000 / extra.requiredHours) * 1.5) < 0.01 && ep.hoursDeduction === 0, JSON.stringify(ep));

const closedMonth = computePayroll({ salary: { amount: 1000 }, summary: { ...extra, requiredHours: 200, overallHours: 210, manualBonus: 0, warnings: 0 }, settings: week, closed: true });
ok("closed month: 210h of 200h → 10h overtime at 5/h × 1.5 = 75", closedMonth.overtimeHours === 10 && closedMonth.overtimePay === 75 && closedMonth.net === 1075, JSON.stringify(closedMonth));
const under = computePayroll({ salary: { amount: 1000 }, summary: { ...extra, requiredHours: 200, overallHours: 190, manualBonus: 0, warnings: 0 }, settings: week, closed: true });
ok("closed month: 190h of 200h → 10h deducted, no overtime", under.overtimePay === 0 && under.hoursDeduction === 50 && under.net === 950, JSON.stringify(under));

console.log(fails ? `${fails} FAILED` : "ALL PASSED");
if (fails) process.exit(1);
