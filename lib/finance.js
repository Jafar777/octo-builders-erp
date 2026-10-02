import Branch from "@/models/Branch";
import FinanceEntry from "@/models/FinanceEntry";
import FundTransfer from "@/models/FundTransfer";
import PayrollRecord from "@/models/PayrollRecord";
import SalaryHistory from "@/models/SalaryHistory";
import Task from "@/models/Task";
import User from "@/models/User";
import WorkProject from "@/models/WorkProject";
import { localParts, monthDays } from "@/lib/attendance";
import { autoHourlyCost, computeFinance, toBase } from "@/lib/financeEngine";
import { getSettings } from "@/lib/settings";
import { DEFAULT_ROLE } from "@/lib/permissions";

const idStr = (v) => (v ? v.toString() : null);

export function rateOf(currencies, code) {
  return currencies.list.find((c) => c.code === code)?.rate || null;
}

// Validates { amount, currency, rate } against the configured currencies and
// returns the stored money fields, or { error }.
export function cleanMoney({ amount, currency, rate }, currencies, { allowNegative = false } = {}) {
  const value = Number(amount);
  if (!Number.isFinite(value) || (!allowNegative && value < 0) || Math.abs(value) > 1e11) return { error: "invalid_amount" };
  const code = String(currency || currencies.base).toUpperCase();
  const configured = rateOf(currencies, code);
  if (!configured) return { error: "invalid_currency" };
  // The rate can be overridden per entry (actual rate of the day); default = Settings.
  const used = Number(rate) > 0 ? Number(rate) : configured;
  return { amount: value, currency: code, rate: code === currencies.base ? 1 : used, baseAmount: toBase(value, code === currencies.base ? 1 : used) };
}

function monthCapacityHours(month, { calendar, workHours }) {
  return monthDays(month).reduce((sum, date) => {
    const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (calendar.weekend.includes(wd) || calendar.holidays.some((h) => h.date === date)) return sum;
    const ramadan = calendar.ramadan?.start && date >= calendar.ramadan.start && date <= calendar.ramadan.end;
    return sum + (ramadan ? workHours.ramadanHours : workHours.dailyHours);
  }, 0);
}

function monthRange(from, to) {
  const out = [];
  let [y, m] = from.split("-").map(Number);
  while (`${y}-${String(m).padStart(2, "0")}` <= to) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

// Monthly salary cost per branch: closed payroll months use the frozen net pay;
// open months up to now are estimated from current salaries.
// Estimates skip people who are inactive or outside their contract dates.
async function salaryCosts(months, settings, staff) {
  const staffBranch = Object.fromEntries(staff.map((u) => [u._id.toString(), idStr(u.branch)]));
  const staffById = Object.fromEntries(staff.map((u) => [u._id.toString(), u]));
  const records = await PayrollRecord.find({ month: { $in: months } }, { user: 1, month: 1, payroll: 1 }).lean();
  const closedMonths = new Set(records.map((r) => r.month));
  const out = [];
  for (const r of records) {
    const p = r.payroll || {};
    if (!p.hasSalary) continue;
    out.push({
      month: r.month,
      branch: staffBranch[idStr(r.user)] || null,
      base: toBase(p.net, rateOf(settings.currencies, p.currency) || 1),
    });
  }

  const open = months.filter((m) => !closedMonths.has(m));
  if (open.length) {
    const salaries = await SalaryHistory.find({ user: { $in: Object.keys(staffBranch) } }).sort({ from: -1 }).lean();
    for (const m of open) {
      const last = monthDays(m).at(-1);
      const seen = new Set();
      for (const s of salaries) {
        const uid = idStr(s.user);
        if (seen.has(uid) || s.from > last) continue;
        seen.add(uid);
        const u = staffById[uid];
        if (!u || u.status === "inactive" || (u.contractStart && u.contractStart > last) || (u.contractEnd && u.contractEnd < `${m}-01`)) continue;
        out.push({ month: m, branch: staffBranch[uid] || null, base: toBase(s.amount, rateOf(settings.currencies, s.currency) || 1), estimated: true });
      }
    }
  }
  return { salaries: out, estimatedMonths: open };
}

// Work hours per project per month (from task timers), for overhead allocation.
async function projectHours(tz) {
  const tasks = await Task.find({ project: { $ne: null }, activeMs: { $gt: 0 } }, { project: 1, activeMs: 1, submittedAt: 1, startedAt: 1 }).lean();
  const acc = {};
  for (const t of tasks) {
    const when = t.submittedAt || t.startedAt;
    if (!when) continue;
    const month = localParts(when, tz).date.slice(0, 7);
    const key = `${idStr(t.project)}|${month}`;
    acc[key] = (acc[key] || 0) + t.activeMs / 3600000;
  }
  return Object.entries(acc).map(([k, h]) => {
    const [project, month] = k.split("|");
    return { project, month, hours: h };
  });
}

export async function loadFinance(year) {
  const settings = await getSettings();
  const [entries, transfers, projects, branches, staff] = await Promise.all([
    FinanceEntry.find().lean(),
    FundTransfer.find().lean(),
    WorkProject.find({}, { name: 1, code: 1, status: 1, branch: 1, client: 1, department: 1, budget: 1, startDate: 1, createdAt: 1, finishedAt: 1, updatedAt: 1, manager: 1 }).lean(),
    Branch.find().lean(),
    User.find({ role: { $ne: DEFAULT_ROLE } }, { branch: 1, status: 1, contractStart: 1, contractEnd: 1 }).lean(),
  ]);
  const tz = settings.hr.timezone;
  const nowMonth = localParts(new Date(), tz).date.slice(0, 7);
  const hours = await projectHours(tz);
  // Project accounts are lifetime, so salaries are needed from the first month with data.
  const first = [`${year}-01`, ...entries.map((e) => e.date.slice(0, 7)), ...hours.map((h) => h.month)].sort()[0];
  const { salaries, estimatedMonths } = await salaryCosts(monthRange(first, nowMonth), settings, staff);
  const ym = (d) => (d ? localParts(new Date(d), tz).date.slice(0, 7) : null);

  const result = computeFinance({
    entries: entries.map((e) => ({ ...e, project: idStr(e.project), branch: idStr(e.branch) })),
    transfers: transfers.map((t) => ({ ...t, fromBranch: idStr(t.fromBranch), toBranch: idStr(t.toBranch) })),
    salaries,
    hours,
    projects: projects.map((p) => ({
      id: p._id.toString(),
      name: p.name,
      code: p.code,
      status: p.status,
      client: p.client,
      department: idStr(p.department),
      branch: idStr(p.branch),
      manager: idStr(p.manager),
      budget: p.budget || 0,
      start: ym(p.startDate || p.createdAt),
      end: ["finished", "archived"].includes(p.status) ? ym(p.finishedAt || p.updatedAt || new Date()) : null,
    })),
    branches: branches.map((b) => ({ id: b._id.toString(), name: b.name, currency: b.currency })),
    year: String(year),
    allocation: settings.finance.allocation,
  });

  // Hourly cost for pricing (Excel: total expenses ÷ available hours).
  const activeStaff = staff.filter((u) => u.status !== "inactive").length;
  const capacity = activeStaff * monthCapacityHours(nowMonth, settings);
  const past = result.monthly.filter((m) => m.month <= nowMonth);
  const auto = autoHourlyCost(past, capacity, settings.pricing.autoMonths);

  return {
    ...result,
    base: settings.currencies.base,
    estimatedMonths: estimatedMonths.filter((m) => m.startsWith(String(year))),
    allocation: settings.finance.allocation,
    hourlyCost: {
      auto,
      manual: settings.pricing.manualHourlyCost,
      mode: settings.pricing.hourlyCostMode,
      used: settings.pricing.hourlyCostMode === "manual" || auto === null ? settings.pricing.manualHourlyCost : auto,
      capacity,
    },
  };
}
