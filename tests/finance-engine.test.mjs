import { autoHourlyCost, computeFinance, toBase } from "../lib/financeEngine.js";
import { quote } from "../lib/pricing.js";

let fails = 0;
const ok = (name, c, x = "") => {
  console.log(`${c ? "PASS" : "FAIL"} ${name} ${c ? "" : JSON.stringify(x)}`);
  if (!c) fails++;
};

// Excel: 24,000 SAR at 3.8 = 6,315.79 USD
ok("SAR → USD at 3.8", toBase(24000, 3.8) === 6315.79);
ok("base currency rate 1", toBase(135, 1) === 135);

const near = (a, b) => Math.abs(a - b) <= 0.011;
const JED = "jed";
const DAM = "dam";
const e = (kind, date, base, extra = {}) => ({ kind, date, baseAmount: base, branch: JED, project: null, ...extra });
const entries = [
  e("contract", "2026-03-01", 6315.79, { project: "m7" }),
  e("payment", "2026-03-10", 6315.79, { project: "m7" }),
  e("contract", "2026-03-01", 18421.05, { project: "abu" }),
  e("adjustment", "2026-04-01", -421.05, { project: "abu" }),
  e("project_expense", "2026-04-05", 500, { project: "abu", branch: DAM }),
  e("operating_expense", "2026-03-15", 1219.74),
  e("operating_expense", "2026-03-20", 135, { branch: DAM }),
  e("operating_expense", "2026-04-20", 300, { branch: DAM }),
];
const transfers = [
  { fromBranch: JED, toBranch: DAM, date: "2026-03-25", status: "received", baseSent: 2000, baseReceived: 1950 },
  { fromBranch: JED, toBranch: DAM, date: "2026-04-25", status: "sent", baseSent: 1000, baseReceived: 0 },
];
const salaries = [
  { month: "2026-03", branch: DAM, base: 3000 },
  { month: "2026-04", branch: DAM, base: 3000 },
];
const hours = [
  { month: "2026-03", project: "m7", hours: 300 },
  { month: "2026-03", project: "abu", hours: 100 },
  { month: "2026-04", project: "abu", hours: 50 },
];
const f = computeFinance({
  entries,
  transfers,
  salaries,
  hours,
  projects: [{ id: "m7", name: "M7" }, { id: "abu", name: "Abu Jamal" }],
  branches: [{ id: JED, name: "Jeddah" }, { id: DAM, name: "Damascus" }],
  year: "2026",
});
const jed = f.funds.find((x) => x.branch === JED);
const dam = f.funds.find((x) => x.branch === DAM);
ok("Jeddah fund = payments − opex − transfers out", near(jed.balance, 6315.79 - 1219.74 - 3000), jed);
ok("money in transit tracked", jed.inTransit === 1000, jed);
ok("Damascus fund = received transfer − expenses − salaries", dam.balance === 1950 - 500 - 435 - 6000, dam);
const m7 = f.projects.find((p) => p.id === "m7");
const abu = f.projects.find((p) => p.id === "abu");
ok("contract total includes adjustments", abu.total === 18000 && abu.remaining === 18000, abu);
// March pool = salaries 3000 + opex 1354.74 = 4354.74; m7 has 300/400 hours → 3266.06
ok("overhead allocated by hours (March 75%)", m7.overhead === 3266.06, m7);
// abu: March 25% (1088.69) + April 100% (3300) = 4388.69
ok("overhead across months", near(abu.overhead, 4388.69), abu);
ok("cash profit = received − expenses − overhead", near(m7.profitReceived, 6315.79 - 3266.06), m7);
ok("transfer cost counted", f.totals.transferCosts === 50, f.totals);
ok("net profit for the year", near(f.totals.netProfit, 6315.79 - 500 - 1654.74 - 6000 - 50), f.totals);
ok("12 monthly rows", f.monthly.length === 12 && f.monthly[2].salaries === 3000);

// Lifetime: last year's hours/salaries still count in this year's project accounts.
const f2 = computeFinance({
  entries: [e("operating_expense", "2025-12-10", 100)],
  transfers: [],
  salaries: [{ month: "2025-12", branch: DAM, base: 900 }],
  hours: [{ month: "2025-12", project: "abu", hours: 10 }],
  projects: [{ id: "abu", name: "Abu", budget: 500 }],
  branches: [{ id: DAM, name: "Damascus" }],
  year: "2026",
});
const abu2 = f2.projects[0];
ok("previous year's costs stay in the project account", abu2.overhead === 1000 && f2.totals.salaries === 0, abu2);
ok("over budget flagged", abu2.overBudget && abu2.budgetUsed === 200, abu2);

// Equal split between the projects running that month.
const f3 = computeFinance({
  entries: [e("operating_expense", "2026-03-10", 300)],
  transfers: [],
  salaries: [],
  hours: [{ month: "2026-03", project: "a", hours: 99 }],
  projects: [
    { id: "a", start: "2026-01", end: null },
    { id: "b", start: "2026-03", end: "2026-05" },
    { id: "c", start: "2026-04", end: null },
  ],
  branches: [{ id: JED, name: "Jeddah" }],
  year: "2026",
  allocation: "equal",
});
ok("equal split ignores hours, skips projects not running", f3.projects.map((p) => p.overhead).join() === "150,150,0", f3.projects);

// Excel Setup_Data: total expenses 5,321.40 / 1,248 available hours = 4.26 per hour
ok("auto hourly cost (Excel 4.26)", autoHourlyCost([{ salaries: 4000, opex: 1321.4 }], 1248, 3) === 4.26);

const pricing = {
  services: [{ key: "interior", designHours: 24, techHours: 6, adminHours: 2 }],
  sizes: [{ key: "medium", margin: 40 }],
  markets: [{ key: "saudi", factor: 1.2 }],
  complexity: [{ key: "high", factor: 1.25 }],
  clientTypes: [{ key: "new", factor: 0.9 }],
};
const q = quote({ lines: [{ service: "interior", quantity: 10 }], sizeKey: "medium", marketKey: "saudi", complexityKey: "high", clientKey: "new", hourlyCost: 4.26, pricing });
ok("hours = 32 × 10", q.hours.total === 320, q);
ok("raw cost = 320 × 4.26", q.rawCost === 1363.2, q);
ok("multiplier = 1.2 × 1.25 × 0.9", q.multiplier === 1.35, q);
ok("price = real cost × 1.4", q.realCost === 1840.32 && q.price === 2576.45 && q.profit === 736.13, q);

console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);
