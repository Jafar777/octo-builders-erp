import { barState, cancelNeedsApproval, canUndoStart, freeGaps, gapFrom, heldSpan, makeCalendar, taskSpan, untangle, UNDO_START_MS } from "../lib/gantt.js";

let fails = 0;
const ok = (name, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"} ${name} ${c ? "" : x}`); if (!c) fails++; };

// Every day 09:00–17:00 (8h), office clock = UTC, no days off.
const days = Array.from({ length: 7 }, () => ({ start: "09:00", end: "17:00", hours: 8 }));
const cal = makeCalendar({ calendar: { weekend: [], holidays: [], ramadan: { start: "", end: "" } }, workHours: { days, special: [] }, hr: { timezone: "UTC" } });
const H = 3600000;
const at = (day, hour) => Date.UTC(2026, 10, 2 + day, hour); // 2 Nov 2026 + day, hour:00
const span = (day, from, to) => ({ start: at(day, from), end: at(day, to) });
const same = (a, b) => a && b && a.start === b.start && a.end === b.end;
const show = (s) => (s ? `${new Date(s.start).toISOString()} → ${new Date(s.end).toISOString()}` : "none");

// Free time is used: busy 9–11 and 14–17; a 3h task from 9 fits 11–14, before the later work.
const gap = gapFrom(at(0, 9), 3 * H, [span(0, 9, 11), span(0, 14, 17)], cal);
ok("new work fills the first free gap that fits", same(gap, span(0, 11, 14)), show(gap));
// A 4h task doesn't fit that gap: it goes after the later work, into the next day.
const gap4 = gapFrom(at(0, 9), 4 * H, [span(0, 9, 11), span(0, 14, 17)], cal);
ok("work that doesn't fit a gap goes after the busy time", same(gap4, span(1, 9, 13)), show(gap4));

// Free time: busy 9–11 and day 1 13–17, looking at days 0–1. 11:00 day 0 to 13:00 day 1
// is one gap across the night (6h + 4h); a 1h gap is left out with a 2h minimum.
let free = freeGaps([span(0, 9, 11), span(1, 13, 17)], at(0, 9), at(2, 0), cal, 2 * H);
ok("free time runs across the night as one gap", free.length === 1 && same(free[0], { start: at(0, 11), end: at(1, 13) }) && free[0].ms === 10 * H, JSON.stringify(free));
free = freeGaps([span(0, 9, 11), span(0, 12, 17)], at(0, 9), at(1, 0), cal, 2 * H);
ok("short gaps aren't free time", free.length === 0, JSON.stringify(free));

// Cancelled work stays on the chart: not started → its plan; started → until it was cancelled.
const planned = { status: "cancelled", plannedStart: new Date(at(0, 9)), dueAt: new Date(at(0, 13)), cancelledAt: new Date(at(0, 10)) };
ok("a cancelled task never started keeps its planned bar", same(taskSpan(planned), span(0, 9, 13)), show(taskSpan(planned)));
const spent = { ...planned, startedAt: new Date(at(0, 9)), cancelledAt: new Date(at(0, 11)) };
ok("a cancelled started task shows the time spent", same(taskSpan(spent), span(0, 9, 11)), show(taskSpan(spent)));
ok("cancelled tasks get their own bar state", barState(planned) === "cancelled");
// Undo start: only shortly after pressing it.
const started = { status: "in_progress", startedAt: new Date(at(0, 9)) };
ok("a start can be undone right after", canUndoStart(started, at(0, 9) + UNDO_START_MS - 1000));
ok("a start can't be undone later", !canUndoStart(started, at(0, 9) + UNDO_START_MS + 1000));
ok("a submitted task can't undo its start", !canUndoStart({ ...started, status: "submitted" }, at(0, 9) + 1000));
// Project work needs the GM / CEO to cancel; own meetings and personal tasks don't.
ok("project work needs approval to cancel", cancelNeedsApproval({ kind: "task", project: "p" }));
ok("a meeting is cancelled straight away", !cancelNeedsApproval({ kind: "meeting", project: "p" }));
ok("a personal task is cancelled straight away", !cancelNeedsApproval({ kind: "personal", project: null }));

// Rejected work: the bar runs from the start to the hand-in, even if it had run late
// (an old expected finish no longer stretches it); running late work still stretches.
const rejected = { status: "rejected", plannedStart: new Date(at(0, 9)), dueAt: new Date(at(0, 11)), startedAt: new Date(at(0, 9)), submittedAt: new Date(at(0, 12)), expectedEnd: new Date(at(0, 14)) };
ok("a rejected bar ends at its hand-in", same(heldSpan(rejected), span(0, 9, 12)), show(heldSpan(rejected)));
ok("rejected work has its own bar state", barState(rejected) === "rejected");
const late = { ...rejected, status: "in_progress", submittedAt: null };
ok("work still running late holds until its expected finish", same(heldSpan(late), span(0, 9, 14)), show(heldSpan(late)));

// Started work running 9–12 pushes a waiting task planned 10–12.
let out = untangle([span(0, 9, 12)], [{ id: "a", span: span(0, 10, 12), priority: "normal" }], cal);
ok("a task overlapping started work moves after it, same length", same(out.get("a"), span(0, 12, 14)), show(out.get("a")));

// Equal priority: the one pushed into the other goes after it.
out = untangle([], [{ id: "a", span: span(0, 9, 11), priority: "normal" }, { id: "b", span: span(0, 10, 12), priority: "normal" }], cal);
ok("equal priority keeps the order", !out.has("a") && same(out.get("b"), span(0, 11, 13)), `a ${show(out.get("a"))} b ${show(out.get("b"))}`);

// Urgent pushed into a normal one takes its place; the normal one moves after it.
out = untangle([], [{ id: "a", span: span(0, 9, 11), priority: "normal" }, { id: "b", span: span(0, 10, 12), priority: "urgent" }], cal);
ok("urgent takes the place of lower priority", same(out.get("b"), span(0, 10, 12)) && same(out.get("a"), span(0, 12, 14)), `a ${show(out.get("a"))} b ${show(out.get("b"))}`);

// A normal task never pushes an urgent one.
out = untangle([], [{ id: "a", span: span(0, 9, 11), priority: "urgent" }, { id: "b", span: span(0, 10, 12), priority: "normal" }], cal);
ok("lower priority never pushes higher", !out.has("a") && same(out.get("b"), span(0, 11, 13)), `a ${show(out.get("a"))} b ${show(out.get("b"))}`);

// Started work is never moved, even by urgent work.
out = untangle([span(0, 9, 11)], [{ id: "u", span: span(0, 10, 12), priority: "urgent" }], cal);
ok("started work stays; urgent goes after it", same(out.get("u"), span(0, 11, 13)), show(out.get("u")));

// A redo of rejected work outranks even urgent work.
out = untangle([], [{ id: "r", span: span(0, 9, 11), priority: "redo" }, { id: "u", span: span(0, 10, 12), priority: "urgent" }], cal);
ok("urgent never pushes a redo", !out.has("r") && same(out.get("u"), span(0, 11, 13)), `r ${show(out.get("r"))} u ${show(out.get("u"))}`);

// Nothing overlaps: nothing moves.
out = untangle([span(0, 9, 10)], [{ id: "a", span: span(0, 10, 12), priority: "normal" }, { id: "b", span: span(0, 13, 15), priority: "urgent" }], cal);
ok("a clean schedule stays as it is", out.size === 0);

console.log(fails ? `${fails} FAILED` : "ALL PASSED");
if (fails) process.exit(1);
