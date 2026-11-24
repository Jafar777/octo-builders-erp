import { actionsFor, buildChains, findAffected, nearestNew, simulatePlan, suggestedAction } from "../lib/clientChange.js";
import { makeCalendar } from "../lib/gantt.js";

let fails = 0;
const ok = (name, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"} ${name} ${c ? "" : x}`); if (!c) fails++; };
const T = (id, over = {}) => ({ _id: id, kind: "task", status: "approved", dependsOn: [], previousTask: null, revision: 0, assignee: "u1", priority: "normal", estimatedHours: 4, ...over });
const ids = (r) => r.affected.map((a) => a.task._id).join();

// What's offered.
ok("approved work has no suggestion", suggestedAction("approved") === "" && actionsFor("approved").join() === "revise,check,none");
ok("suggestions", suggestedAction("todo") === "wait" && suggestedAction("on_hold") === "warn" && suggestedAction("submitted") === "hold");
ok("finished meetings and cancelled work aren't affected", !actionsFor("cancelled").length && !actionsFor("done").length && !actionsFor("rejected").length);

// A → B → C → D, and an unrelated X.
const abc = [T("a"), T("b", { dependsOn: ["a"] }), T("c", { dependsOn: ["b"] }), T("d", { dependsOn: ["c"], status: "todo" }), T("x")];
const g = findAffected("a", abc);
ok("everything built on it, indirectly too, in order", ids(g) === "b,c,d", ids(g));
ok("not what it builds on, nor the unrelated", ids(findAffected("c", abc)) === "d");

// Only A and B change: B2 waits for A2, C stays.
ok("B2 waits for A2", nearestNew("b", g.up, { a: "a2" }, {}).join() === "a2");
ok("D waits for B2 through an unaffected C", nearestNew("d", g.up, { a: "a2", b: "b2" }, { b: "revise", c: "none" }).join() === "b2");
ok("D behind an unstarted C only waits for C", nearestNew("d", g.up, { a: "a2" }, { b: "wait", c: "wait" }).length === 0);

// Revisions: B was rejected and redone as B1 (without links of its own); A was revised before.
const rev = [T("a"), T("a1", { kind: "revision", previousTask: "a", revision: 1 }), T("b", { dependsOn: ["a"], status: "rejected" }), T("b1", { kind: "revision", previousTask: "b", revision: 1 }), T("h", { kind: "help", previousTask: "a1" })];
ok("links to an older version count; the latest one is shown", ids(findAffected("a1", rev)) === "b1", ids(findAffected("a1", rev)));
ok("help isn't a version", buildChains(rev).chains.a.leaf._id === "a1");
ok("a cancelled revision leaves the earlier one", buildChains([T("a"), T("a1", { previousTask: "a", status: "cancelled" })]).chains.a.leaf._id === "a");

// Stage order without task links (imported projects).
const project = { _id: "p", stages: [{ key: "s1", after: [] }, { key: "s2", after: ["s1"] }, { key: "s3", after: [] }] };
const st = [T("m", { project: "p", stage: "s1" }), T("n", { project: "p", stage: "s2" }), T("o", { project: "p", stage: "s3" }), T("q", { project: "other", stage: "s2" })];
ok("stage order counts", ids(findAffected("m", st, project)) === "n", ids(findAffected("m", st, project)));
ok("a loop doesn't hang", ids(findAffected("a", [T("a", { dependsOn: ["b"] }), T("b", { dependsOn: ["a"] })])) === "b");

// The schedule: every day 09:00–17:00 UTC.
const days = Array.from({ length: 7 }, () => ({ start: "09:00", end: "17:00", hours: 8 }));
const cal = makeCalendar({ calendar: { weekend: [], holidays: [], ramadan: { start: "", end: "" } }, workHours: { days, special: [] }, hr: { timezone: "UTC" } });
const at = (day, hour) => Date.UTC(2026, 10, 2 + day, hour);
const planned = (id, u, d, from, to, over = {}) => T(id, { status: "todo", assignee: u, plannedStart: new Date(at(d, from)), dueAt: new Date(at(d, to)), estimatedHours: to - from, ...over });
const fresh = (id, u, hours, deps = []) => ({ _id: id, kind: "revision", revision: 1, priority: "normal", assignee: u, dependsOn: deps, estimatedHours: hours, hours });
const run = (work, f, others = []) => simulatePlan({ work, others, fresh: f, cal, calendarOf: async () => cal, now: at(0, 9) });

const s1 = await run([], [fresh("a2", "u1", 4), fresh("b2", "u2", 2, ["a2"])]);
ok("A2 starts now", s1.spans.a2.start === at(0, 9) && s1.spans.a2.end === at(0, 13));
ok("B2 starts when A2 is ready", s1.spans.b2.start === at(0, 13) && s1.spans.b2.end === at(0, 15));

const s2 = await run([planned("w", "u1", 0, 9, 11), planned("z", "u2", 0, 13, 15, { dependsOn: ["w"] })], [fresh("a2", "u1", 4)]);
ok("planned work makes room", s2.moves.some((m) => m.task._id === "w" && m.to.start === at(0, 13)), JSON.stringify(s2.moves));
ok("and what waits for it moves too", s2.moves.some((m) => m.task._id === "z" && m.to.start === at(0, 15)));

const s3 = await run([planned("d", "u2", 0, 9, 11, { dependsOn: ["a2"] })], [fresh("a2", "u1", 4)]);
ok("unstarted work linked to A2 moves after it", s3.moves.length === 1 && s3.moves[0].to.start === at(0, 13));

const going = T("r", { status: "in_progress", assignee: "u1", startedAt: new Date(at(0, 9)), plannedStart: new Date(at(0, 9)), dueAt: new Date(at(0, 12)) });
const s4 = await run([going], [fresh("a2", "u1", 2)]);
ok("work already going isn't moved; A2 comes after it", !s4.moves.length && s4.spans.a2.start === at(0, 12));
const source = planned("w", "u1", 0, 9, 11);
await run([source], [fresh("a2", "u1", 4)]);
ok("a preview changes nothing", source.plannedStart.getTime() === at(0, 9));

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
