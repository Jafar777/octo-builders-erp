import { computeAttendance, computePayroll } from "../lib/attendance.js";

let fails = 0;
const ok = (name, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"} ${name} ${c ? "" : x}`); if (!c) fails++; };

// A full September 2026 (closed): 8h days, Friday off, holiday on the 23rd → 25 working days = 200h.
const settings = {
  calendar: { weekend: [5], holidays: [{ date: "2026-09-23", name: { ar: "", en: "" } }], ramadan: { start: "", end: "" } },
  workHours: { workStart: "09:00", workEnd: "17:00", dailyHours: 8, ramadanHours: 7, minHours: 7.5, graceMinutes: 15, overtimeMultiplier: 1.5, monthlyRequiredHours: 208 },
  hr: { timezone: "Asia/Damascus", lateIsWarning: true, shortageIsWarning: true, absenceIsWarning: true, warningRules: [{ count: 4, percent: 5 }], deductMissingHours: true, payOvertime: true, bonusSplit: [50, 30, 20] },
};
const p = (date, hm) => new Date(`${date}T${hm}:00+03:00`);
const working = [];
for (let d = 1; d <= 30; d += 1) {
  const iso = `2026-09-${String(d).padStart(2, "0")}`;
  if (new Date(`${iso}T12:00:00Z`).getUTCDay() !== 5 && iso !== "2026-09-23") working.push(iso);
}
// Full 8h on every working day except `skip`.
const punchesExcept = (...skip) => working.filter((d) => !skip.includes(d)).flatMap((d) => [p(d, "09:00"), p(d, "17:00")]);
const run = (punches, leaves = []) => {
  const { days, summary } = computeAttendance({ user: {}, month: "2026-09", punches, leaves, settings, today: "2026-10-01" });
  const pay = computePayroll({ salary: { amount: 1000, currency: "USD" }, summary, settings, closed: true });
  return { day: Object.fromEntries(days.map((x) => [x.date, x])), summary, pay };
};

const full = run(punchesExcept());
ok("hourly rate = salary ÷ month hours = 1000 / 200 = 5", full.summary.requiredHours === 200 && full.pay.hourlyRate === 5, JSON.stringify(full.pay));
ok("full month = full salary", full.pay.net === 1000 && full.pay.hoursDeduction === 0, JSON.stringify(full.pay));

const absent = run(punchesExcept("2026-09-14"));
ok("absent day: status absent + warning", absent.day["2026-09-14"].status === "absent" && absent.day["2026-09-14"].warnings.includes("absent_unjustified"));
ok("absent day: exactly that day's salary, 8h × 5 = 40, deducted", absent.pay.absentDays === 1 && absent.pay.absenceDeduction === 40 && absent.pay.missingHours === 0 && absent.pay.net === 960, JSON.stringify(absent.pay));
ok("absent day counts as 1 warning", absent.pay.warnings === 1);

const sick = run(punchesExcept("2026-09-14"), [{ type: "sick", from: "2026-09-14", to: "2026-09-14" }]);
ok("sick day: no warning", sick.day["2026-09-14"].status === "sick_leave" && sick.day["2026-09-14"].warnings.length === 0);
ok("sick day: counted as a full 8h day, full salary", sick.day["2026-09-14"].counted === 8 && sick.pay.hoursDeduction === 0 && sick.pay.net === 1000, JSON.stringify(sick.pay));

// Absent one day, with 8 extra hours on other days: the absence still costs that day
// (40), and the extra hours are overtime (8h × 5 × the overtime multiplier).
const extra = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-05"].flatMap((d) => [p(d, "17:00"), p(d, "19:00")]);
const covered = run([...punchesExcept("2026-09-14"), ...extra]);
const otPay = 8 * 5 * settings.workHours.overtimeMultiplier;
ok("overtime doesn't cancel an absence: day deducted, overtime paid, warning kept", covered.pay.absenceDeduction === 40 && covered.pay.overtimeHours === 8 && Math.abs(covered.pay.overtimePay - (settings.hr.payOvertime ? otPay : 0)) < 0.01 && covered.pay.warnings === 1, JSON.stringify(covered.pay));

// A 6-hour day is paid its 6 hours: 2 missing hours, no absence.
const shortDay = run([...punchesExcept("2026-09-14"), p("2026-09-14", "09:00"), p("2026-09-14", "15:00")]);
ok("a 6h day is paid 6h: 2h × 5 = 10 deducted, not an absence", shortDay.pay.absentDays === 0 && shortDay.pay.missingHours === 2 && shortDay.pay.net === 990, JSON.stringify(shortDay.pay));

console.log(fails ? `${fails} FAILED` : "ALL PASSED");
if (fails) process.exit(1);
