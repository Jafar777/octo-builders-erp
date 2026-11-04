import assert from "node:assert/strict";
import { clearLeader, rankForType } from "../lib/kpi/bestFor.js";

const tags = [{ key: "exc", kind: "excellent" }, { key: "err", kind: "error" }];
const due = new Date("2026-01-10T12:00:00Z");
const early = new Date("2026-01-10T10:00:00Z");
const late = new Date("2026-01-11T10:00:00Z");
const task = (assignee, o = {}) => ({ assignee, kind: "task", status: "approved", revision: 0, dueAt: due, submittedAt: early, activeMs: 3600000, ratings: [], ...o });

// A: fast, on time, approved first time, rated excellent. B: slow, late, rejected once.
const tasks = [
  ...Array.from({ length: 4 }, () => task("A", { ratings: ["exc"], activeMs: 1800000 })),
  ...Array.from({ length: 3 }, () => task("B", { submittedAt: late, activeMs: 7200000 })),
  task("B", { status: "rejected", rejectCause: "employee", ratings: ["err"] }),
  // C has too few tasks to be compared.
  task("C"),
  task("C"),
];
const ranking = rankForType(tasks, tags);
assert.deepEqual(ranking.map((r) => r.userId), ["A", "B"]);
assert.equal(ranking[0].firstTimePct, 100);
assert.equal(ranking[0].onTimePct, 100);
assert.ok(ranking[0].speedPct > 0);
assert.ok(ranking[1].speedPct < 0);
assert.equal(ranking[1].firstTimePct, 75);

// Rejections not caused by the employee are left out.
const notTheirFault = rankForType([task("D"), task("D"), task("D"), task("D", { status: "rejected", rejectCause: "customer" })], tags);
assert.equal(notTheirFault[0].tasks, 3);
assert.equal(notTheirFault[0].firstTimePct, 100);

assert.deepEqual(rankForType([], tags), []);
console.log("best-for: ok");

// Named only when clearly ahead of the rest.
assert.equal(clearLeader([{ userId: "A", score: 90 }]), null);
assert.equal(clearLeader([{ userId: "A", score: 90 }, { userId: "B", score: 87 }]), null);
const leader = clearLeader([{ userId: "A", score: 90 }, { userId: "B", score: 80 }, { userId: "C", score: 60 }]);
assert.equal(leader.userId, "A");
assert.equal(leader.lead, 10);
assert.equal(leader.compared, 3);
console.log("clear-leader: ok");
