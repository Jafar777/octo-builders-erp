import { computeAttendance, computePayroll } from "../lib/attendance.js";

let fails = 0;
const ok = (name, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"} ${name} ${c ? "" : x}`); if (!c) fails++; };
const settings = {
  calendar: { weekend: [5], holidays: [], ramadan: { start: "", end: "" } },
  workHours: { workStart: "09:00", workEnd: "17:00", dailyHours: 8, ramadanHours: 7, minHours: 7.5, graceMinutes: 15, overtimeMultiplier: 1.5, monthlyRequiredHours: 208 },
  hr: { timezone: "Asia/Damascus", lateIsWarning: false, shortageIsWarning: false, absenceIsWarning: false, warningRules: [], deductMissingHours: true, payOvertime: true },
};
const p = (date, hm) => new Date(`${date}T${hm}:00+03:00`);
// Three 8h days (Tue 1, Wed 2, Thu 3 Sep): the 1st 3h extra, the 2nd 2h extra, the 3rd exactly 8h.
const punches = [p("2026-09-01", "09:00"), p("2026-09-01", "20:00"), p("2026-09-02", "09:00"), p("2026-09-02", "19:00"), p("2026-09-03", "09:00"), p("2026-09-03", "17:00")];
const run = (overtimeApproved) => computeAttendance({ user: {}, month: "2026-09", punches, settings, today: "2026-09-04", overtimeApproved });
const day = (r, d) => r.days.find((x) => x.date === d);

// No request approved: the extra time isn't overtime.
const none = run([]);
ok("no approved request: no overtime", none.summary.overtimeHours === 0, JSON.stringify(none.summary));
ok("the unapproved extra hours are shown", none.summary.unapprovedOvertimeHours === 5, String(none.summary.unapprovedOvertimeHours));

// Approved 2h on the 1st (worked 3h extra): 2h count. Nothing on the 2nd.
const some = run([{ date: "2026-09-01", hours: 2 }]);
ok("approved 2h of 3h extra: 2h overtime that day", day(some, "2026-09-01").overtime === 2 && day(some, "2026-09-01").unapprovedOvertime === 1);
ok("a day without approval has no overtime", day(some, "2026-09-02").overtime === 0);
ok("the month's overtime is only the approved hours", some.summary.overtimeHours === 2, String(some.summary.overtimeHours));

// Approved more than was worked: only what was worked counts.
const more = run([{ date: "2026-09-02", hours: 6 }]);
ok("approved more than worked: only the hours worked", day(more, "2026-09-02").overtime === 2 && more.summary.overtimeHours === 2, String(more.summary.overtimeHours));

// The payslip pays only approved overtime.
const salary = { amount: 1000, currency: "USD" };
const pay = computePayroll({ salary, summary: some.summary, settings });
ok("the payslip pays only the approved hours", pay.overtimeHours === 2, JSON.stringify(pay));
const payNone = computePayroll({ salary, summary: none.summary, settings });
ok("nothing approved: no overtime pay", payNone.overtimeHours === 0 && payNone.overtimePay === 0);

// Older callers (no approval list): every extra hour counts as before.
const legacy = run(undefined);
ok("without the approval rule the old calculation stays", legacy.summary.overtimeHours === 5 && legacy.summary.approvedOvertimeHours === null, JSON.stringify(legacy.summary));

if (fails) process.exit(1);
console.log("overtime: ok");
