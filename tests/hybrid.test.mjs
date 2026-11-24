import { acceptHours, hoursLimit, hybridOn, placeKey, placeOutcome, promiseMoves, suggestHours } from "../lib/hybrid.js";
import { isRedo, makeCalendar, movableTask, workDayEnd } from "../lib/gantt.js";
import { computeKpi } from "../lib/kpi/engine.js";
import { DEFAULT_KPI } from "../lib/kpi/config.js";

let fails = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}`, c ? "" : JSON.stringify(x)); if (!c) fails++; };
const T = (o) => ({ assignee: "me", status: "todo", revision: 0, ...o });

ok("off until switched on", !hybridOn({ departments: {} }, "d") && hybridOn({ departments: { d: "2026-11-01" } }, "d") && !hybridOn({ departments: { d: "x" } }, null));
ok("same room in other spelling", placeKey("p", "s", "غرفة  الأكل") === placeKey("p", "s", "غرفه الاكل") && placeKey("p", "s", "a") !== placeKey("p", "s2", "a"));

const out = (tasks) => placeOutcome(tasks, "me").outcome;
ok("nothing there", out([]) === "new" && out([T({ status: "cancelled" })]) === "new");
ok("planned for me / a redo of mine", out([T()]) === "planned" && out([T({ revision: 1 })]) === "redo");
ok("planned for a colleague", out([T({ assignee: "x" })]) === "taken");
ok("a colleague is on it", out([T({ assignee: "x", status: "on_hold" })]) === "working");
ok("mine, paused", out([T({ status: "on_hold" })]) === "resume");
ok("being reviewed", out([T({ status: "submitted" })]) === "review");
ok("approved / rejected: the latest version counts", out([T({ status: "rejected" }), T({ status: "approved", revision: 1 })]) === "again" && out([T({ status: "approved" }), T({ status: "rejected", revision: 1 })]) === "rejected");

ok("suggested hours", suggestHours({ fallback: 4 }) === 4 && suggestHours({ mine: [2, 3, 9] }) === 3 && suggestHours({ mine: [2], all: [1, 1, 6, 6, 6] }) === 6);
ok("hours within the limit", acceptHours(5, 4, 25).hours === 5 && acceptHours(5, 4, 25).pending === null);
ok("over it: the limit counts, the rest waits", acceptHours(8, 4, 25).hours === 5 && acceptHours(8, 4, 25).pending === 8 && hoursLimit(4, 0) === 4);
ok("none given = the suggestion", acceptHours("", 4, 25).hours === 4);

ok("promise: my own doing doesn't move it", !promiseMoves({ actorId: "me", assigneeId: "me" }) && !promiseMoves({ actorId: null, assigneeId: "me" }) && !promiseMoves({ actorId: null, assigneeId: "me", byAssigneeId: "me" }));
ok("promise: others' doing does", promiseMoves({ actorId: "ceo", assigneeId: "me" }) && promiseMoves({ actorId: "me", assigneeId: "me", byAssigneeId: "x" }) && !promiseMoves({ actorId: "ceo", assigneeId: "me", pulled: true }));
ok("fixed work isn't moved", movableTask(T()) && !movableTask(T({ fixed: true })) && !movableTask(T({ status: "in_progress" })));
ok("improving approved work isn't a redo", isRedo(T({ revision: 1, revisionCause: "employee" })) && !isRedo(T({ revision: 1, revisionCause: "improvement" })));

const days = Array.from({ length: 7 }, () => ({ start: "09:00", end: "17:00", hours: 8 }));
const cal = makeCalendar({ calendar: { weekend: [5], holidays: [], ramadan: { start: "", end: "" } }, workHours: { days, special: [] }, hr: { timezone: "UTC" } });
ok("end of the working day", workDayEnd(Date.UTC(2026, 10, 24, 10), cal) === Date.UTC(2026, 10, 24, 17) && workDayEnd(Date.UTC(2026, 10, 27, 10), cal) === null);

// KPI: the same formula for planned and self-started work.
const at = (d, h) => new Date(Date.UTC(2026, 10, d, h));
const kt = (o) => ({ assignee: "a", kind: "task", status: "approved", revision: 0, dueAt: at(3, 12), submittedAt: at(3, 11), activeMs: 3600000, ratings: [], maxHours: 2, ...o });
const run = (tasks, fair) => computeKpi({ users: [{ id: "a", department: "d" }], attendance: {}, tasks, config: DEFAULT_KPI, ratingTags: [], fair }).results[0];
const metric = (r, m) => r.indicators.flatMap((i) => i.items).find((i) => i.metric === m).value;
ok("where it came from changes nothing", JSON.stringify(run([kt({ origin: "self" })], true).indicators) === JSON.stringify(run([kt({})], true).indicators));
const slid = [kt({ dueAt: at(5, 12), promisedAt: at(3, 12), submittedAt: at(4, 12) })];
ok("a plan that slid is late against its promise", metric(run(slid, true), "on_time_pct") === 0 && metric(run(slid, false), "on_time_pct") === 100);
const again = [kt({}), kt({ kind: "revision", revision: 1, revisionCause: "improvement" }), kt({ kind: "revision", revision: 1, revisionCause: "" })];
ok("doing approved work again isn't a fault", metric(run(again, true), "revisions_pct") === 0 && metric(run(again, false), "revisions_pct") > 30);
ok("a redo through the employee's fault is", metric(run([kt({}), kt({ kind: "revision", revision: 1, revisionCause: "employee" })], true), "revisions_pct") === 50);
const two = (tasks) => computeKpi({ users: [{ id: "a", department: "d" }, { id: "b", department: "d" }], attendance: {}, tasks, config: DEFAULT_KPI, ratingTags: [], fair: true }).results.find((r) => r.userId === "a");
ok("improving the same work again isn't extra output", metric(two([kt({}), kt({ assignee: "b" })]), "approved_ratio") === metric(two([kt({}), kt({ kind: "revision", revision: 1, revisionCause: "improvement" }), kt({ assignee: "b" })]), "approved_ratio"));

process.exit(fails ? 1 : 0);
