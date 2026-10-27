import { criticalPath, holdsTime, makeCalendar, officeDaySpan, takesTime, taskSpan, untangle } from "../lib/gantt.js";
import { buildCells } from "../lib/boardCells.js";

let fails = 0;
const ok = (name, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"} ${name} ${c ? "" : x}`); if (!c) fails++; };

// Every day 09:00–17:00 (8h), office clock = UTC, no days off.
const days = Array.from({ length: 7 }, () => ({ start: "09:00", end: "17:00", hours: 8 }));
const cal = makeCalendar({ calendar: { weekend: [], holidays: [], ramadan: { start: "", end: "" } }, workHours: { days, special: [] }, hr: { timezone: "UTC" } });
const H = 3600000;
const at = (day, hour) => Date.UTC(2026, 10, 2 + day, hour); // 2 Nov 2026 + day, hour:00
const d = (ms) => new Date(ms);
const show = (s) => (s ? `${d(s.start).toISOString()} → ${d(s.end).toISOString()}` : "none");

// ---------- bars show what happened once work starts ----------
const planned = { status: "todo", plannedStart: d(at(0, 9)), dueAt: d(at(0, 13)), estimatedHours: 4 };
let s = taskSpan(planned);
ok("a not-started bar shows its plan", s.start === at(0, 9) && s.end === at(0, 13), show(s));

s = taskSpan({ ...planned, status: "in_progress", startedAt: d(at(0, 11)) });
ok("a late start draws from the actual start", s.start === at(0, 11) && s.end === at(0, 13), show(s));

s = taskSpan({ ...planned, status: "in_progress", startedAt: d(at(0, 14)) });
ok("started after its due time: lasts its estimate from the start", s.start === at(0, 14) && s.end === at(0, 14) + 4 * H, show(s));

s = taskSpan({ ...planned, status: "approved", startedAt: d(at(0, 9)), submittedAt: d(at(0, 12)) });
ok("handed-in work ends at the hand-in", s.start === at(0, 9) && s.end === at(0, 12), show(s));

// ---------- meetings take time but aren't "the one task" ----------
const meeting = { kind: "meeting", status: "todo", plannedStart: d(at(0, 10)), dueAt: d(at(0, 11)) };
ok("a meeting takes time on the plan", takesTime(meeting) && !holdsTime(meeting));

// ---------- leave ----------
const leave = officeDaySpan("2026-11-03", cal);
ok("a day of leave covers the whole office day", leave.start === Date.UTC(2026, 10, 3) && leave.end === Date.UTC(2026, 10, 4));

// A 16h task planned Mon 9 → Tue 17 before Tuesday's leave was known: with Tuesday as a
// day off, it keeps its 16 hours and moves after the leave (Wed + Thu).
const leaveCal = { ...cal, holidays: ["2026-11-03"] };
let out = untangle([leave], [{ id: "a", span: { start: at(0, 9), end: at(1, 17) }, workMs: 16 * H, priority: "normal" }], leaveCal);
ok("work on a day of leave moves after it, keeping its hours", out.get("a")?.start === at(2, 9) && out.get("a")?.end === at(3, 17), show(out.get("a")));

// A meeting in the middle of the day: waiting work planned on it goes after it.
out = untangle([{ start: at(0, 10), end: at(0, 11) }], [{ id: "b", span: { start: at(0, 10), end: at(0, 12) }, priority: "urgent" }], cal);
ok("work landing on a meeting goes after it", out.get("b")?.start === at(0, 11) && out.get("b")?.end === at(0, 13), show(out.get("b")));

// ---------- critical path ----------
let cp = criticalPath(
  [
    { id: "a", span: { start: at(0, 9), end: at(0, 13) }, dependsOn: [], assignee: "u1", project: "P", status: "todo" },
    { id: "b", span: { start: at(0, 13), end: at(0, 17) }, dependsOn: ["a"], assignee: "u2", project: "P", status: "todo" },
    { id: "c", span: { start: at(0, 9), end: at(0, 10) }, dependsOn: [], assignee: "u3", project: "P", status: "todo" },
  ],
  cal
);
ok("the dependency chain that sets the delivery is critical; work with slack isn't", cp.has("a") && cp.has("b") && !cp.has("c"), [...cp].join());

// P's last task waits for its employee to finish another project's task, which ends
// overnight right before it: that task drives P's delivery too.
cp = criticalPath(
  [
    { id: "x", span: { start: at(0, 9), end: at(0, 17) }, dependsOn: [], assignee: "u1", project: "Q", status: "in_progress" },
    { id: "p", span: { start: at(1, 9), end: at(1, 12) }, dependsOn: [], assignee: "u1", project: "P", status: "todo" },
    { id: "done", span: { start: at(0, 9), end: at(0, 10) }, dependsOn: [], assignee: "u2", project: "P", status: "approved" },
  ],
  cal
);
ok("the employee's queue counts: another project's work before it is critical", cp.has("p") && cp.has("x") && !cp.has("done"), [...cp].join());

// ---------- the board: stage locks (Option B) and weighted progress ----------
const stages = [{ key: "a", after: [] }, { key: "b", after: ["a"] }];
const task = (stage, status, n, hours = 0, revision = 0) => ({ _id: n, stage, kind: "task", status, revision, createdAt: d(n), number: n, assignee: 1, maxHours: hours });
const board = (tasks, overrides = []) => buildCells({ stages, overrides }, tasks);
ok("work in progress keeps the next stage locked", board([task("a", "in_progress", 1)]).locked.includes("b"));
ok("handed-in work releases the next stage before review", !board([task("a", "submitted", 1)]).locked.includes("b"));
ok("one task handed in, another not started: still locked", board([task("a", "submitted", 1), task("a", "todo", 2)]).locked.includes("b"));
ok("a rejection locks it again until the redo is handed in", board([task("a", "rejected", 1), task("a", "todo", 2, 0, 1)]).locked.includes("b"));
ok("Skip releases the next stage", !board([], [{ stage: "a", status: "skip", at: d(1) }]).locked.includes("b"));
ok("handed in isn't counted as progress yet", board([task("a", "submitted", 1, 6)]).progress === 0);

// Stage a = 6h approved, stage b = 2h waiting: 6 / 8 done.
let p = board([task("a", "approved", 1, 6), task("b", "todo", 2, 2)]).progress;
ok("progress weighs stages by their hours", Math.abs(p - 0.75) < 1e-9, String(p));
// A stage with no hours yet counts as an average one.
p = buildCells({ stages: [...stages, { key: "c", after: [] }], overrides: [] }, [task("a", "approved", 1, 6), task("b", "todo", 2, 2)]).progress;
ok("a stage without hours counts as an average stage", Math.abs(p - 6 / 12) < 1e-9, String(p));

console.log(fails ? `${fails} FAILED` : "ALL PASSED");
if (fails) process.exit(1);
