import { agingBucket, balanceSheet, buildJournal, cashForecast, matchCandidates, profitAndLoss, trialBalance } from "../lib/ledgerEngine.js";

let fails = 0;
const ok = (name, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"} ${name} ${c ? "" : x}`); if (!c) fails++; };
const J = "jed", D = "dam", P = "p1";

const data = {
  invoices: [
    { _id: "i1", number: "INV-1", status: "issued", project: P, branch: J, issueDate: "2026-01-10", dueDate: "2026-01-24", baseTotal: 1000 },
    { _id: "i2", number: "INV-2", status: "issued", project: P, branch: J, issueDate: "2026-02-10", dueDate: "2026-02-24", baseTotal: 500 },
    { _id: "i3", status: "draft", project: P, branch: J, issueDate: "", baseTotal: 999 },
  ],
  entries: [
    // An advance before any invoice, then a payment.
    { _id: "e1", kind: "payment", project: P, branch: J, date: "2026-01-05", amount: 300, baseAmount: 300 },
    { _id: "e2", kind: "payment", project: P, branch: J, date: "2026-02-01", amount: 900, baseAmount: 900 },
    { _id: "e3", kind: "operating_expense", branch: D, date: "2026-01-15", amount: 200, baseAmount: 200, category: "rent" },
    { _id: "e4", kind: "operating_expense", branch: D, date: "2026-01-20", amount: 50, baseAmount: 50, category: "salaries" },
    { _id: "e5", kind: "contract", project: P, date: "2026-01-01", amount: 5000, baseAmount: 5000 },
  ],
  transfers: [{ _id: "t1", fromBranch: J, toBranch: D, date: "2026-01-12", receivedAt: "2026-01-14", status: "received", baseSent: 400, baseReceived: 390 }],
  salaries: [{ month: "2026-01", branch: D, base: 600, estimated: false }, { month: "2026-02", branch: D, base: 600, estimated: true }],
  journals: [{ _id: "j1", date: "2026-01-01", branch: D, memo: "Opening", lines: [{ account: "cash", debit: 2000, credit: 0 }, { account: "equity", debit: 0, credit: 2000 }] }],
  salaryCategories: ["salaries"],
};
const { lines, invoices } = buildJournal(data);
const tb = trialBalance(lines);
ok("books balance", Math.abs(tb.totalDebit - tb.totalCredit) < 0.01, `${tb.totalDebit} vs ${tb.totalCredit}`);
ok("advance applied to first invoice, then payment settles it", invoices.i1.paidBase === 1000 && invoices.i1.outstandingBase === 0 && invoices.i1.paidDate === "2026-02-01");
ok("second invoice partly open", invoices.i2.paidBase === 200 && invoices.i2.outstandingBase === 300, JSON.stringify(invoices.i2));
ok("draft not booked", !invoices.i3);

const pl = profitAndLoss(lines, { from: "2026-01-01", to: "2026-12-31" });
const get = (list, k) => list.find((x) => x.account === k)?.amount;
ok("revenue = issued invoices", get(pl.income, "revenue") === 1500);
ok("salaries = payroll + salary expenses", get(pl.expenses, "salaries") === 650, String(get(pl.expenses, "salaries")));
ok("transfer cost", get(pl.expenses, "transfer_costs") === 10);
ok("net", pl.net === 1500 - 200 - 650 - 10, String(pl.net));

const bs = balanceSheet(lines, { to: "2026-12-31" });
ok("balance sheet balances", bs.balanced, JSON.stringify(bs));
ok("receivables open 300", get(bs.assets, "receivables") === 300);
// Branch cash: Jeddah 300 + 900 - 400 = 800; Damascus 2000 - 250 - 600 + 390 = 1540.
const jed = balanceSheet(lines, { to: "2026-12-31", branch: J });
ok("Jeddah cash", get(jed.assets, "cash") === 800, String(get(jed.assets, "cash")));
const dam = balanceSheet(lines, { to: "2026-12-31", branch: D });
ok("Damascus cash", get(dam.assets, "cash") === 1540, String(get(dam.assets, "cash")));

ok("aging current", agingBucket("2026-03-10", "2026-03-01") === "current");
ok("aging 45 days", agingBucket("2026-01-15", "2026-03-01") === "d60");
ok("aging 120 days", agingBucket("2025-11-01", "2026-03-01") === "d90plus");

const f = cashForecast({
  startCash: 1000,
  months: ["2026-03", "2026-04"],
  openInvoices: [{ outstandingBase: 300, dueDate: "2026-02-24" }],
  planned: [{ date: "2026-04-10", baseAmount: 2000 }],
  outflows: { "2026-03": { salaries: 600, expenses: 100 }, "2026-04": { salaries: 600, expenses: 100 } },
});
ok("forecast overdue lands this month", f[0].invoicesIn === 300 && f[0].closing === 600, JSON.stringify(f[0]));
ok("forecast planned billing", f[1].plannedIn === 2000 && f[1].closing === 1900);

const cands = matchCandidates({ branch: J, date: "2026-02-03", amount: 900 }, data.entries);
ok("bank match by amount and date", cands.length === 1 && cands[0]._id === "e2");
ok("bank no match far date", matchCandidates({ branch: J, date: "2026-04-03", amount: 900 }, data.entries).length === 0);

if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log("ledger: all passed");
