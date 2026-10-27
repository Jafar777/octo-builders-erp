import { computeAttendance, computePayroll } from "../lib/attendance.js";
import { DEFAULT_KPI, bandPoints, indicatorWeight } from "../lib/kpi/config.js";
import { computeKpi } from "../lib/kpi/engine.js";
let fails = 0;
const ok = (name, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"} ${name} ${c ? "" : x}`); if (!c) fails++; };
const settings = {
  calendar: { weekend: [5], holidays: [{ date: "2026-09-23", name: { ar: "", en: "" } }], ramadan: { start: "", end: "" } },
  workHours: { workStart: "09:00", workEnd: "17:00", dailyHours: 8, ramadanHours: 7, minHours: 7.5, graceMinutes: 15, overtimeMultiplier: 1.5, monthlyRequiredHours: 208 },
  hr: { timezone: "Asia/Damascus", lateIsWarning: true, shortageIsWarning: true, absenceIsWarning: true, warningRules: [{ count: 4, percent: 5 }, { count: 5, percent: 15 }], deductMissingHours: true, payOvertime: true, bonusSplit: [50, 30, 20] },
};
// Damascus = UTC+3. Punch helper takes local time.
const p = (date, hm) => new Date(`${date}T${hm}:00+03:00`);
const punches = [
  p("2026-09-01", "08:56"), p("2026-09-01", "17:10"), // on time, 8:14 → 0:14 overtime
  p("2026-09-02", "09:44"), p("2026-09-02", "17:59"), // late (9:44 > 9:15)
  p("2026-09-03", "09:10"), p("2026-09-03", "15:30"), // within grace, 6:20 → shortage warning
  p("2026-09-05", "10:00"),                             // one punch → missing checkout
];
const { days, summary } = computeAttendance({
  user: {}, month: "2026-09", punches,
  overrides: [{ date: "2026-09-07", status: "", exemptWarnings: true, bonus: 20 }],
  leaves: [{ type: "annual", from: "2026-09-08", to: "2026-09-09" }],
  settings, today: "2026-09-10",
});
const d = Object.fromEntries(days.map((x) => [x.date, x]));
ok("on-time day present, overtime 0.23h", d["2026-09-01"].status === "present" && d["2026-09-01"].lateMinutes === 0 && Math.abs(d["2026-09-01"].overtime - 0.23) < 0.01, JSON.stringify(d["2026-09-01"]));
ok("late beyond grace = warning", d["2026-09-02"].lateMinutes === 29 && d["2026-09-02"].warnings.includes("late"));
ok("inside grace not late; short day = shortage warning", d["2026-09-03"].lateMinutes === 0 && d["2026-09-03"].warnings.includes("shortage") && d["2026-09-03"].shortage > 1.6);
ok("friday = weekend, 0 required", d["2026-09-04"].status === "weekend" && d["2026-09-04"].required === 0);
ok("single punch = missing check-out, no credit", d["2026-09-05"].missingCheckOut && d["2026-09-05"].credited === 0);
ok("no punches past day = absent + warning", d["2026-09-06"].status === "absent" && d["2026-09-06"].warnings.includes("absent_unjustified"));
ok("exempted day: absent without warning, bonus kept", d["2026-09-07"].status === "absent" && d["2026-09-07"].warnings.length === 0 && d["2026-09-07"].bonus === 20);
ok("approved annual leave = credited", d["2026-09-08"].status === "annual_leave" && d["2026-09-08"].credited === 8);
ok("future day = upcoming", d["2026-09-15"].status === "upcoming");
ok("holiday = 0 required", d["2026-09-23"].status === "holiday" && d["2026-09-23"].required === 0);
ok("month requirement = 25 working days × 8 = 200h", summary.requiredHours === 200, summary.requiredHours);
ok("summary counts (single late punch on the 5th also late)", summary.lateCount === 2 && summary.absentDays === 2 && summary.warnings === 4, JSON.stringify(summary));

const pay = computePayroll({ salary: { amount: 500, currency: "USD" }, summary, settings, kpiBonus: 30 });
ok("hourly rate = 500 / 200", pay.hourlyRate === 2.5);
ok("4 warnings → 5% (Excel rule)", pay.warningPercent === 5 && pay.warningDeduction === 25);
ok("absent days cost exactly their hours: 2 days × 8h × 2.5 = 40", pay.absentDays === 2 && pay.absenceDeduction === 40, JSON.stringify(pay));
ok("net = base − absences − missing hours − warnings + overtime + bonus", Math.abs(pay.net - (500 - pay.absenceDeduction - pay.hoursDeduction - pay.warningDeduction + pay.overtimePay + 50)) < 0.02, JSON.stringify(pay));
const pay5 = computePayroll({ salary: { amount: 500 }, summary: { ...summary, warnings: 5 }, settings });
ok("5 warnings → 15% deduction (Excel rule)", pay5.warningPercent === 15 && pay5.warningDeduction === 75);

// KPI bands = Excel
const ind = Object.fromEntries(DEFAULT_KPI.indicators.map((i) => [i.key, i]));
ok("weights 10/15/20/25/10/20 = 100", ["attendance","efficiency","delivery","quality","cooperation","skills"].map((k) => indicatorWeight(ind[k])).join() === "10,15,20,25,10,20");
const item = (k, i) => ind[k].items.find((x) => x.key === i).bands;
ok("on-time 41% → 0 pts (Excel)", bandPoints(item("delivery", "on_time"), 41) === 0);
ok("delay 0:39h → 6 pts (Excel)", bandPoints(item("delivery", "delay"), 0.65) === 6);
ok("late share 27% → 2 pts (Excel)", bandPoints(item("delivery", "late_share"), 27) === 2);
ok("first-time 68% → 4 pts (Excel)", bandPoints(item("quality", "first_time"), 68) === 4);
ok("utilisation 97% → 4 pts (Excel)", bandPoints(item("efficiency", "utilization"), 97) === 4);
ok("2 warnings → 2 pts (Excel)", bandPoints(item("attendance", "warnings"), 2) === 2);

const tasks = [
  { assignee: "a", kind: "task", status: "approved", revision: 0, dueAt: "2026-09-10T10:00:00Z", submittedAt: "2026-09-10T09:00:00Z", activeMs: 3600000, ratings: ["exc_design"], type: "cad" },
  { assignee: "a", kind: "task", status: "rejected", revision: 0, dueAt: "2026-09-10T10:00:00Z", submittedAt: "2026-09-10T12:00:00Z", activeMs: 7200000, ratings: ["err_autocad"], type: "cad" },
  { assignee: "a", kind: "help", status: "approved", revision: 0, submittedAt: "2026-09-11T09:00:00Z", activeMs: 600000, ratings: [], type: "presentation" },
  { assignee: "b", kind: "task", status: "approved", revision: 0, dueAt: "2026-09-10T10:00:00Z", submittedAt: "2026-09-09T09:00:00Z", activeMs: 3600000, ratings: ["normal"], type: "max" },
];
const tags = [{ key: "exc_design", kind: "excellent", skill: "design" }, { key: "err_autocad", kind: "error", skill: "autocad" }, { key: "normal", kind: "neutral", skill: "" }];
const kpi = computeKpi({
  users: [{ id: "a", department: "d" }, { id: "b", department: "d" }, { id: "gm", department: "d", excluded: true }],
  attendance: { a: summary, b: { ...summary, lateCount: 0, warnings: 0, shortHours: 0 } },
  tasks, config: DEFAULT_KPI, ratingTags: tags, bonusPool: 100, bonusSplit: [50, 30, 20],
});
const A = kpi.results.find((r) => r.userId === "a");
const v = (r, ind, i) => r.indicators.find((x) => x.key === ind).items.find((x) => x.key === i);
ok("excluded users not ranked", kpi.results.length === 2 && kpi.results.every((r) => r.userId !== "gm"));
ok("on-time 50% for a", v(A, "delivery", "on_time").value === 50);
ok("rejection 50% for a", v(A, "quality", "rejections").value === 50);
ok("help counted + 100% of contributions", v(A, "cooperation", "help").value === 1 && v(A, "cooperation", "share").value === 100);
ok("advanced skill (presentation) counted", v(A, "cooperation", "advanced").value === 1);
ok("design skill = (1 exc − 0 err)/2 reviewed = 50%", v(A, "skills", "design").value === 50);
ok("software skill floored at 0", v(A, "skills", "software").value === 0);
ok("ranks + bonus 50/30 split", kpi.results[0].rank === 1 && kpi.results[0].bonus === 50 && kpi.results[1].bonus === 30, JSON.stringify(kpi.results.map((r) => [r.userId, r.score, r.bonus])));
console.log(fails ? `${fails} FAILED` : "ALL PASSED");
