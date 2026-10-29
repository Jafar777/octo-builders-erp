import { hybridScore, managementScore, measuredShare, reviewSpeedScore, teamMetrics } from "../lib/kpi/hybrid.js";
import { computeKpi } from "../lib/kpi/engine.js";
import { DEFAULT_KPI } from "../lib/kpi/config.js";
import { projectScore, scheduleScore } from "../lib/projectHealth.js";

let fails = 0;
const ok = (name, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"} ${name} ${c ? "" : x}`); if (!c) fails++; };

// The customer's worked examples: management 85, execution 92.
ok("80% management → 86.4 (86)", hybridScore({ management: 85, execution: 92, share: 80, execTasks: 5 }).score === 86);
ok("50 / 50 → 88.5 (89)", hybridScore({ management: 85, execution: 92, share: 50, execTasks: 5 }).score === 89);
ok("30% management → 89.9 (90)", hybridScore({ management: 85, execution: 92, share: 30, execTasks: 5 }).score === 90);
ok("execution 95, management 80, 50/50 → 87.5 (88)", hybridScore({ management: 80, execution: 95, share: 50, execTasks: 5 }).score === 88);
// Few own tasks: execution keeps at least half its weight.
const few = hybridScore({ management: 80, execution: 40, share: 60, execTasks: 0 });
ok("no own tasks: execution weight halved (40% → 20%)", few.executionWeight === 20 && few.managementWeight === 80, JSON.stringify(few));
ok("no team data: execution alone", hybridScore({ management: null, execution: 70, share: 60 }).score === 70);

// Measured share: 90 task hours of 180 worked = 50% management.
ok("measured share 90/180 → 50%", measuredShare(90, 180) === 50);
ok("no hours → no measured share", measuredShare(10, 0) === null);

// Team metrics.
const team = [
  { score: 80, counts: { handedIn: 10, late: 1, firstReviewed: 8, firstApproved: 6, taskHours: 150, workedHours: 170 } },
  { score: 70, counts: { handedIn: 10, late: 3, firstReviewed: 8, firstApproved: 8, taskHours: 100, workedHours: 170 } },
];
const m = teamMetrics(team, [2, 5, 30]);
ok("team on-time pooled (16/20 = 80)", m.on_time === 80, JSON.stringify(m));
ok("first-time approval pooled (14/16 = 88)", m.quality === 88);
ok("team KPI average 75", m.team_kpi === 75);
ok("uneven workload lowers balance", m.balance < 100 && m.balance > 50, String(m.balance));
ok("review speed: median 5h → 100", m.review_speed === 100);
ok("slow reviews score low", reviewSpeedScore([60, 70, 200]) === 40);
ok("one member: no balance", teamMetrics([team[0]]).balance === null);
const mg = managementScore({ on_time: 80, quality: null, utilization: null, balance: null, team_kpi: 60, review_speed: null }, { on_time: 50, team_kpi: 50 }, 100, 30);
ok("management = team 70 × 70% + rating 100 × 30% = 79", mg.score === 79 && mg.team === 70, JSON.stringify(mg));

// Engine: fairness.
const d = (day, h = 10) => new Date(Date.UTC(2026, 9, day, h)).toISOString();
const base = { kind: "task", type: "cad", revision: 0, dueAt: d(10), submittedAt: d(9), activeMs: 3600000, maxHours: 4, ratings: [] };
const run = (tasks, extra = {}) =>
  computeKpi({
    users: [{ id: "e", department: "d" }, { id: "x", department: "d" }, { id: "h", department: "d" }],
    attendance: { e: { workedHours: 100 }, x: { workedHours: 100 }, h: { workedHours: 100 } },
    tasks,
    config: DEFAULT_KPI,
    ratingTags: [],
    ...extra,
  });
const item = (res, user, key) => res.results.find((r) => r.userId === user).indicators.flatMap((i) => i.items).find((i) => i.key === key).value;

const mgmtRejected = run([
  { ...base, assignee: "e", status: "approved" },
  { ...base, assignee: "e", status: "rejected", rejectCause: "management" },
  { ...base, assignee: "e", kind: "revision", revision: 1, status: "approved", revisionCause: "management" },
]);
ok("a management rejection isn't the employee's", item(mgmtRejected, "e", "rejections") === 0, String(item(mgmtRejected, "e", "rejections")));
ok("a management redo isn't counted as their revision", item(mgmtRejected, "e", "revisions") === 0);
const ownRejected = run([{ ...base, assignee: "e", status: "approved" }, { ...base, assignee: "e", status: "rejected", rejectCause: "employee" }]);
ok("the employee's own rejection still counts (50%)", item(ownRejected, "e", "rejections") === 50);
const waitingCustomer = run([{ ...base, assignee: "e", status: "submitted", reviewLevel: "customer" }]);
ok("work waiting only for the customer counts as approved", item(waitingCustomer, "e", "first_time") === 100);
const cancelled = run([{ ...base, assignee: "e", status: "cancelled", activeMs: 10 * 3600000, maxHours: 40, submittedAt: null }]);
ok("hours spent on cancelled work count (10h of 100)", item(cancelled, "e", "utilization") === 10, String(item(cancelled, "e", "utilization")));
ok("cancelled work isn't counted as late or on time", item(cancelled, "e", "on_time") === null);

// Engine: the head's hybrid score.
const hybrid = run(
  [
    { ...base, assignee: "e", status: "approved", reviews: [{ by: "h", at: d(9, 14), decision: "approve" }] },
    { ...base, assignee: "x", status: "approved" },
  ],
  { managers: { h: { share: 60 } }, manualScores: { h: 80 } }
);
const head = hybrid.results.find((r) => r.userId === "h");
ok("the head gets a hybrid score", head.hybrid && head.hybrid.share === 60 && head.hybrid.teamSize === 2, JSON.stringify(head.hybrid));
ok("their review speed comes from their reviews (4h → 100)", head.hybrid.metrics.review_speed === 100);
ok("employees keep their system score", hybrid.results.find((r) => r.userId === "e").score === hybrid.results.find((r) => r.userId === "e").systemScore);

// Project schedule against Baseline 1 (planned 1 Oct → 31 Oct, 30 days).
const bl = { start: d(1), end: d(31) };
ok("on the baseline → 100", scheduleScore(bl, d(31)) === 100);
ok("earlier than the baseline → 100", scheduleScore(bl, d(25)) === 100);
ok("3 days late on a 30-day plan → 90", scheduleScore(bl, new Date(Date.UTC(2026, 10, 3, 10)).toISOString()) === 90);
ok("no baseline → no schedule part", scheduleScore(null, d(31)) === null);
const slipped = projectScore([{ ...base, assignee: "e", status: "approved" }], { baseline: bl, end: new Date(Date.UTC(2026, 10, 15, 10)).toISOString() });
ok("a slipped project no longer scores 100 just because tasks met the moved plan", slipped.delivery === 100 && slipped.schedule === 50 && slipped.score < 100, JSON.stringify(slipped));

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
