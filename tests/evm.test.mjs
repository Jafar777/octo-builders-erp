import { evmTone, plannedFraction, projectEvm, utilization } from "../lib/evm.js";

let fails = 0;
const ok = (name, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"} ${name} ${c ? "" : x}`); if (!c) fails++; };
const H = 3600000;
const now = Date.parse("2026-06-10T12:00:00Z");
const day = (d) => new Date(`2026-06-${String(d).padStart(2, "0")}T12:00:00Z`);

const tasks = [
  // Planned 1-5 June, approved, took 10h of 8 planned.
  { status: "approved", estimatedHours: 8, activeMs: 10 * H, baselineStart: day(1), baselineEnd: day(5), assignee: "a" },
  // Planned 6-14 June (half way by the 10th), in progress, 4h worked of 8.
  { status: "in_progress", estimatedHours: 8, activeMs: 4 * H, baselineStart: day(6), baselineEnd: day(14), assignee: "b" },
  // Planned later, not started.
  { status: "todo", estimatedHours: 16, activeMs: 0, baselineStart: day(15), baselineEnd: day(20), assignee: "a" },
  { status: "cancelled", estimatedHours: 50, baselineStart: day(1), baselineEnd: day(2) },
];
ok("fraction before", plannedFraction(tasks[2], now) === 0);
ok("fraction after", plannedFraction(tasks[0], now) === 1);
ok("fraction middle", Math.abs(plannedFraction(tasks[1], now) - 0.5) < 0.01);

const e = projectEvm(tasks, now, { a: 10, b: 20 });
ok("BAC ignores cancelled", e.bac === 32, String(e.bac));
ok("PV = 8 + 4", e.pv === 12, String(e.pv));
ok("AC = 14h", e.ac === 14, String(e.ac));
// EV = 8 (done) + 8 × 0.5 (4 of 8 hours) = 12
ok("EV", e.ev === 12, String(e.ev));
ok("SPI on schedule", e.spi === 1);
ok("CPI under 1 (more hours than earned)", e.cpi === 0.86, String(e.cpi));
ok("EAC", e.eac === 37.21, String(e.eac));
ok("money planned", e.money.planned === 80 + 160 + 160, String(e.money.planned));
ok("money actual", e.money.actual === 100 + 80, String(e.money.actual));
ok("tones", evmTone(1) === "ok" && evmTone(0.9) === "watch" && evmTone(0.5) === "bad" && evmTone(null) === "none");

const u = utilization([{ person: "a", project: "p", hours: 120 }, { person: "a", project: null, hours: 10 }], { a: 160, b: 160 });
ok("utilization", u.find((x) => x.person === "a").utilization === 75 && u.find((x) => x.person === "b").utilization === 0);

if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log("evm: all passed");
