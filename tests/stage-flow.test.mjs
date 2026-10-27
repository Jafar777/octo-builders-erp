import { allAtOnce, cleanAfter, flowOf, moveStage, stageAfter, stageColumns, stepByStep } from "../lib/stageFlow.js";

let fails = 0;
const ok = (name, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"} ${name} ${c ? "" : x}`); if (!c) fails++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const base = ["a", "b", "c", "d"].map((key) => ({ key }));

const chain = stepByStep(base);
ok("step by step: each waits for the one before", same(chain.map((s) => s.after), [[], ["a"], ["b"], ["c"]]));
ok("step by step is 'ordered'", flowOf(chain) === "ordered");
ok("all at once is 'random'", flowOf(allAtOnce(base)) === "random");

// a → b, a → c, (b + c) → d: two wait for one, one waits for two.
const branched = cleanAfter([{ key: "a", after: [] }, { key: "b", after: ["a"] }, { key: "c", after: ["a"] }, { key: "d", after: ["b", "c"] }]);
ok("branches are 'mixed'", flowOf(branched) === "mixed");
ok("columns: b and c side by side, d after both", same(stageColumns(branched), { a: 0, b: 1, c: 1, d: 2 }));

ok("waits on later stages are dropped", same(cleanAfter([{ key: "a", after: ["b"] }, { key: "b", after: ["a", "a"] }]).map((s) => s.after), [[], ["a"]]));
ok("waitForPrevious follows after", same(branched.map((s) => s.waitForPrevious), [false, true, true, true]));

const moved = moveStage(branched, 3, 1); // d above b and c
ok("moving a stage above what it waits for drops those waits", same(moved.map((s) => [s.key, s.after]), [["a", []], ["d", []], ["b", ["a"]], ["c", ["a"]]]));

const legacy = [{ key: "a" }, { key: "b", waitForPrevious: true }, { key: "c", waitForPrevious: false }];
ok("old projects: waitForPrevious = every earlier stage", same(stageAfter(legacy, 1), ["a"]) && same(stageAfter(legacy, 2), []));

console.log(fails ? `${fails} FAILED` : "ALL PASSED");
if (fails) process.exit(1);
