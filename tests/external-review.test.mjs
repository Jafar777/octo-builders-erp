import { awaitingExternal, externalSpan, heldSpan, makeCalendar, readyTime } from "../lib/gantt.js";

let fails = 0;
const ok = (name, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"} ${name} ${c ? "" : x}`); if (!c) fails++; };

// Every day 09:00–17:00 (8h), office clock = UTC, no days off.
const days = Array.from({ length: 7 }, () => ({ start: "09:00", end: "17:00", hours: 8 }));
const cal = makeCalendar({ calendar: { weekend: [], holidays: [], ramadan: { start: "", end: "" } }, workHours: { days, special: [] }, hr: { timezone: "UTC" } });
const at = (day, hour) => Date.UTC(2026, 10, 2 + day, hour);
const iso = (ms) => new Date(ms).toISOString();

// A 9–13 task with a 12-working-hour external review after it.
const base = { plannedStart: new Date(at(0, 9)), dueAt: new Date(at(0, 13)), externalReview: { hours: 12, receivedAt: null } };

// Not handed in yet: ready 12 working hours after its planned end (13:00 + 4h today, 8h tomorrow).
const todo = { ...base, status: "todo" };
ok("planned: the next tasks wait for the review's working hours", readyTime(todo, cal, at(0, 8)) === at(1, 17), iso(readyTime(todo, cal, at(0, 8))));
ok("the review holds nobody's time", heldSpan(todo).end === at(0, 13));
ok("not waiting before it's handed in", !awaitingExternal(todo));

// Handed in at 12:00: the review runs from then.
const sent = { ...base, status: "submitted", submittedAt: new Date(at(0, 12)) };
ok("handed in early: the review starts then", readyTime(sent, cal, at(0, 12)) === at(1, 16), iso(readyTime(sent, cal, at(0, 12))));
ok("handed in: waiting for the review", awaitingExternal(sent));

// The time is up and nothing came back: the next tasks keep waiting (until now at least).
const late = readyTime(sent, cal, at(3, 10));
ok("a late review keeps the next tasks waiting", late === at(3, 10), iso(late));
ok("a late review shows as late", externalSpan(sent, cal, at(3, 10)).late);

// Back early: the wait ends when it was received.
const back = { ...sent, externalReview: { hours: 12, receivedAt: new Date(at(0, 15)) } };
ok("received early: the next tasks can start then", readyTime(back, cal, at(0, 16)) === at(0, 15), iso(readyTime(back, cal, at(0, 16))));
ok("received: not waiting any more", !awaitingExternal(back));

// No review, or a cancelled task: just its finish.
ok("no external review: ready when finished", readyTime({ ...base, status: "todo", externalReview: { hours: 0 } }, cal) === at(0, 13));
ok("a cancelled task holds nothing up for a review", !awaitingExternal({ ...sent, status: "cancelled" }));

if (fails) process.exit(1);
console.log("external-review: ok");
