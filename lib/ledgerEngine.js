// The books (pure, no database): double-entry lines posted automatically from what the
// company already records — invoices, payments, expenses, fund transfers and closed
// payroll months — plus manual journal entries. All amounts in the BASE currency.
// No tax accounts: the company isn't required to pay or charge tax.

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Chart of accounts. `normal` = the side that increases it.
export const ACCOUNTS = [
  { key: "cash", type: "asset", normal: "debit" }, // per branch (each line has its branch)
  { key: "in_transit", type: "asset", normal: "debit" }, // transfers sent, not yet received
  { key: "receivables", type: "asset", normal: "debit" }, // issued invoices not yet paid
  { key: "other_assets", type: "asset", normal: "debit" },
  { key: "client_advances", type: "liability", normal: "credit" }, // paid before being invoiced
  { key: "loans", type: "liability", normal: "credit" },
  { key: "other_liabilities", type: "liability", normal: "credit" },
  { key: "equity", type: "equity", normal: "credit" }, // owner's money, opening balances
  { key: "revenue", type: "income", normal: "credit" },
  { key: "other_income", type: "income", normal: "credit" },
  { key: "project_expenses", type: "expense", normal: "debit" },
  { key: "operating_expenses", type: "expense", normal: "debit" },
  { key: "salaries", type: "expense", normal: "debit" },
  { key: "transfer_costs", type: "expense", normal: "debit" },
  { key: "other_expenses", type: "expense", normal: "debit" },
];
export const ACCOUNT_KEYS = ACCOUNTS.map((a) => a.key);
const typeOf = Object.fromEntries(ACCOUNTS.map((a) => [a.key, a.type]));
const normalOf = Object.fromEntries(ACCOUNTS.map((a) => [a.key, a.normal]));

const lastDay = (month) => {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

/**
 * @param entries   finance entries { _id, kind, date, project, branch, category, amount, baseAmount, description }
 * @param transfers fund transfers { _id, fromBranch, toBranch, date, receivedAt, status, baseSent, baseReceived }
 * @param salaries  [{ month, branch, base, estimated }] — only paid (not estimated) months are booked
 * @param invoices  { _id, number, status, project, branch, issueDate, dueDate, baseTotal }
 * @param journals  manual { _id, date, branch, memo, lines: [{ account, debit, credit }] }
 * @param salaryCategories expense category keys that are salaries
 * @returns { lines, invoices: { [id]: { paidBase, outstandingBase, paidDate } } }
 */
export function buildJournal({ entries = [], transfers = [], salaries = [], invoices = [], journals = [], salaryCategories = [] }) {
  const lines = [];
  const id = (v) => (v ? String(v) : null);
  // One double entry. A negative amount (a discount, a refund) swaps the sides.
  const post = (date, debit, credit, amount, { branch = null, debitBranch = branch, creditBranch = branch, source, memo = "", project = null } = {}) => {
    const a = r2(amount);
    if (!a) return;
    const [d, c, db, cb] = a > 0 ? [debit, credit, debitBranch, creditBranch] : [credit, debit, creditBranch, debitBranch];
    const v = Math.abs(a);
    lines.push({ date, account: d, branch: db, debit: v, credit: 0, source, memo, project });
    lines.push({ date, account: c, branch: cb, debit: 0, credit: v, source, memo, project });
  };

  // --- invoices and project payments, per project in date order: an invoice raises the
  // receivable (and uses up any advance); a payment settles receivables oldest first,
  // and anything beyond what's invoiced is held as a client advance.
  const status = {};
  const byProject = {};
  const add = (pid, ev) => (byProject[pid || "none"] ||= []).push(ev);
  // Invoices and payments are matched per project, or per client when there's no project.
  const accountOf = (x) => id(x.project) || (x.client ? `client:${id(x.client)}` : null);
  for (const inv of invoices) {
    if (inv.status !== "issued" || !inv.issueDate) continue;
    status[id(inv._id)] = { paidBase: 0, outstandingBase: r2(inv.baseTotal), paidDate: null };
    add(accountOf(inv), { kind: "invoice", date: inv.issueDate, inv });
  }
  for (const e of entries) if (e.kind === "payment") add(accountOf(e), { kind: "payment", date: e.date, e });

  for (const [pid, events] of Object.entries(byProject)) {
    events.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "invoice" ? -1 : 1));
    const open = []; // invoice ids with outstanding amounts, oldest first
    let advance = 0;
    const settle = (amount, date) => {
      let left = amount;
      while (left > 0.004 && open.length) {
        const s = status[open[0]];
        const x = Math.min(left, s.outstandingBase);
        s.outstandingBase = r2(s.outstandingBase - x);
        s.paidBase = r2(s.paidBase + x);
        left = r2(left - x);
        if (s.outstandingBase <= 0.004) {
          s.outstandingBase = 0;
          s.paidDate = date;
          open.shift();
        }
      }
      return r2(amount - left);
    };
    for (const ev of events) {
      if (ev.kind === "invoice") {
        const { inv } = ev;
        const project = pid === "none" || pid.startsWith("client:") ? null : pid;
        const memo = inv.number;
        const source = { type: "invoice", id: id(inv._id) };
        post(ev.date, "receivables", "revenue", inv.baseTotal, { branch: id(inv.branch), source, memo, project });
        open.push(id(inv._id));
        if (advance > 0.004) {
          const used = settle(advance, ev.date);
          advance = r2(advance - used);
          post(ev.date, "client_advances", "receivables", used, { branch: id(inv.branch), source, memo, project });
        }
      } else {
        const { e } = ev;
        const branch = id(e.branch);
        const source = { type: "entry", id: id(e._id) };
        const project = pid === "none" || pid.startsWith("client:") ? null : pid;
        if (pid === "none") {
          post(e.date, "cash", "revenue", e.baseAmount, { branch, source, memo: e.description });
          continue;
        }
        const applied = e.baseAmount > 0 ? settle(e.baseAmount, e.date) : 0;
        post(e.date, "cash", "receivables", applied, { branch, source, memo: e.description, project });
        const rest = r2(e.baseAmount - applied);
        if (rest > 0) advance = r2(advance + rest);
        post(e.date, "cash", "client_advances", rest, { branch, source, memo: e.description, project });
      }
    }
  }

  // --- expenses
  for (const e of entries) {
    if (e.kind !== "project_expense" && e.kind !== "operating_expense") continue;
    const account = salaryCategories.includes(e.category) ? "salaries" : e.kind === "project_expense" ? "project_expenses" : "operating_expenses";
    post(e.date, account, "cash", e.baseAmount, { branch: id(e.branch), source: { type: "entry", id: id(e._id) }, memo: e.description || e.beneficiary || "", project: id(e.project) });
  }

  // --- payroll: each closed month, on its last day
  for (const s of salaries) {
    if (s.estimated || !s.base) continue;
    post(lastDay(s.month), "salaries", "cash", s.base, { branch: id(s.branch), source: { type: "payroll", id: s.month }, memo: s.month });
  }

  // --- fund transfers between branches
  for (const t of transfers) {
    const source = { type: "transfer", id: id(t._id) };
    post(t.date, "in_transit", "cash", t.baseSent, { creditBranch: id(t.fromBranch), debitBranch: null, source });
    if (t.status === "received") {
      const at = t.receivedAt || t.date;
      post(at, "cash", "in_transit", t.baseReceived, { debitBranch: id(t.toBranch), creditBranch: null, source });
      post(at, "transfer_costs", "in_transit", r2(t.baseSent - t.baseReceived), { branch: null, source });
    }
  }

  // --- manual entries
  for (const j of journals) {
    for (const l of j.lines || []) {
      if (!ACCOUNT_KEYS.includes(l.account)) continue;
      lines.push({ date: j.date, account: l.account, branch: id(j.branch), debit: r2(l.debit), credit: r2(l.credit), source: { type: "journal", id: id(j._id) }, memo: j.memo || "" });
    }
  }

  lines.sort((a, b) => a.date.localeCompare(b.date));
  return { lines, invoices: status };
}

// A line counts for a branch when it's that branch's (lines without a branch — transfers
// in transit, company-wide entries — only show company-wide).
const forBranch = (branch) => (l) => !branch || l.branch === branch;

// Balance of each account, as the account's own sign (assets positive, income positive…).
function balances(lines) {
  const out = Object.fromEntries(ACCOUNT_KEYS.map((k) => [k, 0]));
  for (const l of lines) out[l.account] += normalOf[l.account] === "debit" ? l.debit - l.credit : l.credit - l.debit;
  for (const k of ACCOUNT_KEYS) out[k] = r2(out[k]);
  return out;
}

export function trialBalance(lines, { to, branch = null } = {}) {
  const rows = Object.fromEntries(ACCOUNT_KEYS.map((k) => [k, { account: k, type: typeOf[k], debit: 0, credit: 0 }]));
  for (const l of lines) {
    if ((to && l.date > to) || !forBranch(branch)(l)) continue;
    rows[l.account].debit += l.debit;
    rows[l.account].credit += l.credit;
  }
  const list = Object.values(rows).map((r) => {
    const net = r2(r.debit - r.credit);
    return { ...r, debit: r2(r.debit), credit: r2(r.credit), balanceDebit: net > 0 ? net : 0, balanceCredit: net < 0 ? -net : 0 };
  });
  return {
    rows: list.filter((r) => r.debit || r.credit),
    totalDebit: r2(list.reduce((a, r) => a + r.balanceDebit, 0)),
    totalCredit: r2(list.reduce((a, r) => a + r.balanceCredit, 0)),
  };
}

export function profitAndLoss(lines, { from, to, branch = null } = {}) {
  const b = balances(lines.filter((l) => (!from || l.date >= from) && (!to || l.date <= to) && forBranch(branch)(l)));
  const income = ACCOUNTS.filter((a) => a.type === "income").map((a) => ({ account: a.key, amount: b[a.key] }));
  const expenses = ACCOUNTS.filter((a) => a.type === "expense").map((a) => ({ account: a.key, amount: b[a.key] }));
  const totalIncome = r2(income.reduce((s, x) => s + x.amount, 0));
  const totalExpenses = r2(expenses.reduce((s, x) => s + x.amount, 0));
  return { income, expenses, totalIncome, totalExpenses, net: r2(totalIncome - totalExpenses) };
}

export function balanceSheet(lines, { to, branch = null } = {}) {
  const b = balances(lines.filter((l) => (!to || l.date <= to) && forBranch(branch)(l)));
  const pick = (type) => ACCOUNTS.filter((a) => a.type === type).map((a) => ({ account: a.key, amount: b[a.key] })).filter((x) => x.amount);
  const earnings = r2(ACCOUNTS.filter((a) => a.type === "income").reduce((s, a) => s + b[a.key], 0) - ACCOUNTS.filter((a) => a.type === "expense").reduce((s, a) => s + b[a.key], 0));
  const assets = pick("asset");
  const liabilities = pick("liability");
  const equity = [...pick("equity"), { account: "retained_earnings", amount: earnings }];
  const totalAssets = r2(assets.reduce((s, x) => s + x.amount, 0));
  const totalLiabilities = r2(liabilities.reduce((s, x) => s + x.amount, 0));
  const totalEquity = r2(equity.reduce((s, x) => s + x.amount, 0));
  return { assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity, balanced: Math.abs(totalAssets - totalLiabilities - totalEquity) < 0.05 };
}

// One account's lines with the running balance.
export function accountLedger(lines, account, { from, to, branch = null } = {}) {
  let running = 0;
  let opening = 0;
  const sign = (l) => (normalOf[account] === "debit" ? l.debit - l.credit : l.credit - l.debit);
  const out = [];
  for (const l of lines) {
    if (l.account !== account || !forBranch(branch)(l) || (to && l.date > to)) continue;
    running = r2(running + sign(l));
    if (from && l.date < from) {
      opening = running;
      continue;
    }
    out.push({ ...l, balance: running });
  }
  return { opening, lines: out, closing: running };
}

// Money owed, by how late it is: not yet due, 1–30, 31–60, 61–90, over 90 days.
export const AGING_BUCKETS = ["current", "d30", "d60", "d90", "d90plus"];
export function agingBucket(dueDate, today) {
  if (!dueDate || dueDate >= today) return "current";
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86400000);
  return days <= 30 ? "d30" : days <= 60 ? "d60" : days <= 90 ? "d90" : "d90plus";
}

/**
 * Cash in the coming months (base currency).
 * @param startCash      cash today
 * @param months         ["2026-11", …] the months to show; the first is the current one
 * @param openInvoices   [{ outstandingBase, dueDate }] — overdue ones are expected this month
 * @param planned        [{ date, baseAmount }] milestone billings not invoiced yet, with the
 *                       date the Gantt expects them plus the payment terms
 * @param outflows       { [month]: { salaries, expenses } } from budgets or recent averages
 */
export function cashForecast({ startCash, months, openInvoices = [], planned = [], outflows = {} }) {
  const first = months[0];
  const monthOf = (d) => (!d || d.slice(0, 7) < first ? first : d.slice(0, 7));
  let cash = r2(startCash);
  return months.map((m) => {
    const invoicesIn = r2(openInvoices.filter((i) => monthOf(i.dueDate) === m).reduce((s, i) => s + i.outstandingBase, 0));
    const plannedIn = r2(planned.filter((p) => monthOf(p.date) === m).reduce((s, p) => s + p.baseAmount, 0));
    const salaries = r2(outflows[m]?.salaries || 0);
    const expenses = r2(outflows[m]?.expenses || 0);
    const opening = cash;
    cash = r2(cash + invoicesIn + plannedIn - salaries - expenses);
    return { month: m, opening, invoicesIn, plannedIn, salaries, expenses, closing: cash };
  });
}

// Bank matching: the recorded entries that could be this statement line — same branch,
// same amount (money in = payments, out = expenses), within `days` days, not yet matched.
export function matchCandidates(line, entries, { days = 7, taken = new Set() } = {}) {
  const t = Date.parse(`${line.date}T00:00:00Z`);
  return entries
    .filter((e) => !taken.has(String(e._id)) && String(e.branch) === String(line.branch))
    .filter((e) => (line.amount > 0 ? e.kind === "payment" : ["project_expense", "operating_expense"].includes(e.kind)))
    .filter((e) => Math.abs(Math.abs(e.amount) - Math.abs(line.amount)) < 0.01)
    .map((e) => ({ e, gap: Math.abs(Date.parse(`${e.date}T00:00:00Z`) - t) / 86400000 }))
    .filter((x) => x.gap <= days)
    .sort((a, b) => a.gap - b.gap)
    .map((x) => x.e);
}
