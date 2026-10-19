// Finance engine (pure, no database) — the Excel "Master Data" and fund sheets.
// All amounts here are already in the BASE currency (baseAmount / baseSent ...).

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const monthOf = (date) => String(date).slice(0, 7);

// Expense categories that are salaries paid by hand ("Salaries", "رواتب الموظفين", "أجور"...)
// — matched on the key and both names; their expenses are summed with payroll, not opex.
export const isSalaryCategory = (c) =>
  /salar|wage|payroll/i.test(`${c?.key || ""} ${c?.name?.en || ""}`) || /رواتب|راتب|أجور|اجور/.test(c?.name?.ar || "");

// Converts an amount with a "units per 1 base" rate. Rate 0/invalid → treat as base.
export function toBase(amount, rate) {
  const n = Number(amount) || 0;
  const x = Number(rate);
  return r2(x > 0 ? n / x : n);
}

/**
 * @param entries     finance entries (lean) with baseAmount
 * @param transfers   fund transfers with baseSent / baseReceived
 * @param salaries    [{ month, branch, base, estimated }]  monthly salary cost per branch
 *                    (estimated = open month, from current salaries; not yet paid).
 *                    May cover several years: project costs are lifetime.
 * @param hours       [{ month, project, hours }] work hours on each project per month
 * @param projects    [{ id, name, code, status, branch, budget, start, end }]
 *                    start / end = "YYYY-MM" (end null while running) for "equal" split
 * @param branches    [{ id, name }]
 * @param year        "2026" — period for the flows and totals (balances and project
 *                    accounts are all-time)
 * @param allocation  "hours" | "equal" — how each month's salaries + operating costs
 *                    are shared between projects
 * @param salaryCategories  expense category keys that count as salaries (see isSalaryCategory)
 */
export function computeFinance({ entries, transfers, salaries, hours, projects, branches, year, allocation = "hours", salaryCategories = [] }) {
  const isSalaryEntry = (e) => (e.kind === "operating_expense" || e.kind === "project_expense") && salaryCategories.includes(e.category);
  const inYear = (d) => String(d).startsWith(year);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

  // --- branch funds (all time): payments in, expenses + salaries out, transfers.
  const funds = Object.fromEntries(
    branches.map((b) => [b.id, { branch: b.id, name: b.name, income: 0, expenses: 0, salaries: 0, transfersIn: 0, transfersOut: 0, inTransit: 0, balance: 0 }])
  );
  const fund = (id) => (id && funds[id]) || null;
  for (const e of entries) {
    const f = fund(e.branch);
    if (!f) continue;
    if (e.kind === "payment") f.income += e.baseAmount;
    if (e.kind === "project_expense" || e.kind === "operating_expense") f.expenses += e.baseAmount;
  }
  // Funds only count salaries actually paid (closed payroll months), not estimates.
  for (const s of salaries) {
    const f = fund(s.branch);
    if (f && !s.estimated) f.salaries += s.base;
  }
  for (const t of transfers) {
    const from = fund(t.fromBranch);
    const to = fund(t.toBranch);
    if (from) from.transfersOut += t.baseSent;
    if (t.status === "received") {
      if (to) to.transfersIn += t.baseReceived;
    } else if (from) {
      from.inTransit += t.baseSent;
    }
  }
  for (const f of Object.values(funds)) {
    f.balance = r2(f.income - f.expenses - f.salaries - f.transfersOut + f.transfersIn);
    for (const k of ["income", "expenses", "salaries", "transfersIn", "transfersOut", "inTransit"]) f[k] = r2(f[k]);
  }

  // --- monthly table for the year (Excel "ملخص المصاريف التشغيلية")
  const monthly = months.map((m) => {
    const ofMonth = (kind) => entries.filter((e) => e.kind === kind && monthOf(e.date) === m && !isSalaryEntry(e));
    const opexByBranch = {};
    for (const e of ofMonth("operating_expense")) opexByBranch[e.branch || "none"] = r2((opexByBranch[e.branch || "none"] || 0) + e.baseAmount);
    const salaryByBranch = {};
    for (const s of salaries.filter((x) => x.month === m)) salaryByBranch[s.branch || "none"] = r2((salaryByBranch[s.branch || "none"] || 0) + s.base);
    for (const e of entries.filter((x) => isSalaryEntry(x) && monthOf(x.date) === m)) salaryByBranch[e.branch || "none"] = r2((salaryByBranch[e.branch || "none"] || 0) + e.baseAmount);
    const income = r2(ofMonth("payment").reduce((a, e) => a + e.baseAmount, 0));
    const projectExpenses = r2(ofMonth("project_expense").reduce((a, e) => a + e.baseAmount, 0));
    const opex = r2(Object.values(opexByBranch).reduce((a, b) => a + b, 0));
    const salary = r2(Object.values(salaryByBranch).reduce((a, b) => a + b, 0));
    return { month: m, income, projectExpenses, opex, salaries: salary, opexByBranch, salaryByBranch, net: r2(income - projectExpenses - opex - salary) };
  });

  // --- overhead allocation (lifetime): each month's salaries + operating costs are
  // shared between projects — by the hours worked on them that month ("نسبة تحميل
  // العبء", the Excel default) or equally between the projects running that month.
  const pools = {};
  for (const sal of salaries) pools[sal.month] = (pools[sal.month] || 0) + sal.base;
  for (const e of entries) if (e.kind === "operating_expense") pools[monthOf(e.date)] = (pools[monthOf(e.date)] || 0) + e.baseAmount;
  const hoursByMonth = {};
  for (const h of hours) hoursByMonth[h.month] = (hoursByMonth[h.month] || 0) + h.hours;
  const allocated = {};
  const projectHours = {};
  for (const h of hours) projectHours[h.project] = (projectHours[h.project] || 0) + h.hours;
  if (allocation === "equal") {
    for (const [m, pool] of Object.entries(pools)) {
      const running = projects.filter((p) => p.start && p.start <= m && (!p.end || p.end >= m));
      for (const p of running) allocated[p.id] = (allocated[p.id] || 0) + pool / running.length;
    }
  } else {
    for (const h of hours) {
      if (!hoursByMonth[h.month]) continue;
      allocated[h.project] = (allocated[h.project] || 0) + ((pools[h.month] || 0) * h.hours) / hoursByMonth[h.month];
    }
  }

  // --- per project (contract figures are all-time; costs allocated within the year)
  const projectRows = projects.map((p) => {
    const mine = entries.filter((e) => e.project === p.id);
    const sum = (kind) => r2(mine.filter((e) => e.kind === kind).reduce((a, e) => a + e.baseAmount, 0));
    const contract = sum("contract");
    const adjustments = sum("adjustment");
    const total = r2(contract + adjustments);
    const received = sum("payment");
    const expenses = sum("project_expense");
    const overhead = r2(allocated[p.id] || 0);
    const cost = r2(expenses + overhead);
    const budget = Number(p.budget) || 0;
    return {
      ...p,
      contract,
      adjustments,
      total,
      received,
      remaining: r2(total - received),
      expenses,
      hours: r2(projectHours[p.id] || 0),
      overhead,
      profitReceived: r2(received - expenses - overhead), // cash view
      profitContract: r2(total - expenses - overhead), // when fully paid
      cost,
      budget,
      budgetUsed: budget ? Math.round((cost / budget) * 100) : null,
      overBudget: budget > 0 && cost > budget,
    };
  });

  const yearEntries = entries.filter((e) => inYear(e.date));
  const totals = {
    projects: projectRows.filter((p) => p.total || p.received || p.expenses || p.hours).length,
    contracts: r2(projectRows.reduce((a, p) => a + p.total, 0)),
    receivables: r2(projectRows.reduce((a, p) => a + Math.max(0, p.remaining), 0)),
    received: r2(yearEntries.filter((e) => e.kind === "payment").reduce((a, e) => a + e.baseAmount, 0)),
    projectExpenses: r2(monthly.reduce((a, m) => a + m.projectExpenses, 0)),
    opex: r2(monthly.reduce((a, m) => a + m.opex, 0)),
    salaries: r2(monthly.reduce((a, m) => a + m.salaries, 0)),
    transferCosts: r2(
      transfers.filter((t) => t.status === "received" && inYear(t.date)).reduce((a, t) => a + (t.baseSent - t.baseReceived), 0)
    ),
  };
  totals.netProfit = r2(totals.received - totals.projectExpenses - totals.opex - totals.salaries - totals.transferCosts);
  totals.margin = totals.received ? r2((totals.netProfit / totals.received) * 100) : null;

  return { year, totals, funds: Object.values(funds), monthly, projects: projectRows };
}

// Hourly cost for pricing: average monthly (salaries + operating) ÷ available hours.
export function autoHourlyCost(monthly, availableHoursPerMonth, months) {
  const used = monthly.filter((m) => m.salaries || m.opex).slice(-months);
  if (!used.length || !availableHoursPerMonth) return null;
  const avg = used.reduce((a, m) => a + m.salaries + m.opex, 0) / used.length;
  return r2(avg / availableHoursPerMonth);
}
