// The report builder's data: each dataset says who may use it, which rows a person
// sees (their role's scope), its columns, and how to read one row. Reports never show
// more than the person could already see elsewhere.

import { hasPermission } from "@/lib/currentUser";
import { overtimeScope } from "@/lib/overtime";
import { purchaseScope } from "@/lib/purchasing";
import { userDepartments } from "@/lib/scope";
import { loadBooks, serializeInvoice } from "@/lib/books";
import { workedHours } from "@/lib/evm";
import { pickName, viewerLang } from "@/lib/personName";
import Asset from "@/models/Asset";
import Branch from "@/models/Branch";
import Department from "@/models/Department";
import FinanceEntry from "@/models/FinanceEntry";
import Invoice from "@/models/Invoice";
import Lead from "@/models/Lead";
import LeaveRequest from "@/models/LeaveRequest";
import OvertimeRequest from "@/models/OvertimeRequest";
import PurchaseRequest from "@/models/PurchaseRequest";
import Task from "@/models/Task";
import User from "@/models/User";
import WorkProject from "@/models/WorkProject";

const idStr = (v) => (v ? v.toString() : null);
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const has = (u, ...perms) => perms.some((p) => hasPermission(u, p));
const deptScope = (user, field = "department") => (user.scope === "all" ? {} : user.scope === "department" ? { [field]: { $in: userDepartments(user) } } : null);

// type: text | number | date — numbers can be summed and averaged when grouping.
export const DATASETS = {
  tasks: {
    allowed: (u) => u.isStaff && !u.limited,
    date: "plannedStart",
    columns: { number: "number", heading: "text", project: "text", stage: "text", department: "text", assignee: "text", status: "text", plannedStart: "date", dueAt: "date", submittedAt: "date", estimatedHours: "number", workedHours: "number", stars: "number" },
    query: (u) => deptScope(u) || { assignee: u.id },
    load: (q) => Task.find({ ...q, kind: { $ne: "personal" } }).limit(5000).lean(),
    row: (t, n) => ({
      number: t.number,
      heading: t.title || t.stage || "",
      project: n.project(t.project),
      stage: t.stage,
      department: n.department(t.department),
      assignee: n.person(t.assignee),
      status: t.status,
      plannedStart: day(t.plannedStart),
      dueAt: day(t.dueAt),
      submittedAt: day(t.submittedAt),
      estimatedHours: t.estimatedHours || 0,
      workedHours: r2(workedHours(t)),
      stars: t.stars || 0,
    }),
  },
  projects: {
    allowed: (u) => u.isStaff && !u.limited && has(u, "projects.view", "projects.manage"),
    date: "startDate",
    columns: { code: "text", name: "text", client: "text", department: "text", status: "text", priority: "text", startDate: "date", forecastEnd: "date", dueDate: "date" },
    query: (u) => deptScope(u) || { _id: null },
    load: (q) => WorkProject.find(q).limit(2000).lean(),
    row: (p, n, lang) => ({ code: p.code, name: p.name?.[lang] || p.name?.en, client: p.client, department: n.department(p.department), status: p.status, priority: p.priority, startDate: day(p.startDate), forecastEnd: day(p.forecastEnd), dueDate: day(p.dueDate) }),
  },
  overtime: {
    allowed: (u) => u.isStaff && !u.limited,
    date: "date",
    columns: { date: "date", person: "text", department: "text", hours: "number", approvedHours: "number", status: "text" },
    query: (u) => overtimeScope(u),
    load: (q) => OvertimeRequest.find(q).limit(5000).lean(),
    row: (o, n) => ({ date: o.date, person: n.person(o.user), department: n.department(o.department), hours: o.hours, approvedHours: o.approvedHours || 0, status: o.status }),
  },
  leave: {
    allowed: (u) => u.isStaff && !u.limited,
    date: "from",
    columns: { from: "date", to: "date", person: "text", department: "text", type: "text", days: "number", status: "text" },
    query: (u) => (has(u, "leave.approve") ? deptScope(u) || { user: u.id } : { user: u.id }),
    load: (q) => LeaveRequest.find(q).limit(5000).lean(),
    row: (l, n) => ({ from: l.from, to: l.to, person: n.person(l.user), department: n.department(l.department), type: l.type, days: l.days || 0, status: l.status }),
  },
  invoices: {
    allowed: (u) => u.isStaff && !u.limited && has(u, "finance.view", "invoices.manage"),
    date: "issueDate",
    columns: { number: "text", client: "text", project: "text", branch: "text", issueDate: "date", dueDate: "date", currency: "text", total: "number", paid: "number", outstanding: "number", state: "text" },
    query: () => ({}),
    load: async (q) => {
      const { journal } = await loadBooks();
      return (await Invoice.find(q).limit(5000).lean()).map((i) => ({ ...i, _s: serializeInvoice(i, journal.invoices) }));
    },
    row: (i, n) => ({ number: i.number || "—", client: i._s.clientName, project: n.project(i.project), branch: n.branch(i.branch), issueDate: i.issueDate, dueDate: i.dueDate, currency: i.currency, total: i.total, paid: i._s.paid, outstanding: i._s.outstanding, state: i._s.state }),
  },
  expenses: {
    allowed: (u) => u.isStaff && !u.limited && has(u, "finance.view"),
    date: "date",
    columns: { date: "date", kind: "text", category: "text", project: "text", branch: "text", description: "text", currency: "text", amount: "number", baseAmount: "number" },
    query: () => ({ kind: { $in: ["project_expense", "operating_expense"] } }),
    load: (q) => FinanceEntry.find(q).limit(10000).lean(),
    row: (e, n) => ({ date: e.date, kind: e.kind, category: e.category, project: n.project(e.project), branch: n.branch(e.branch), description: e.description || e.beneficiary, currency: e.currency, amount: e.amount, baseAmount: e.baseAmount }),
  },
  payments: {
    allowed: (u) => u.isStaff && !u.limited && has(u, "finance.view"),
    date: "date",
    columns: { date: "date", project: "text", branch: "text", description: "text", currency: "text", amount: "number", baseAmount: "number" },
    query: () => ({ kind: "payment" }),
    load: (q) => FinanceEntry.find(q).limit(10000).lean(),
    row: (e, n) => ({ date: e.date, project: n.project(e.project), branch: n.branch(e.branch), description: e.description, currency: e.currency, amount: e.amount, baseAmount: e.baseAmount }),
  },
  leads: {
    allowed: (u) => u.isStaff && !u.limited && has(u, "sales.manage"),
    date: "createdAt",
    columns: { createdAt: "date", name: "text", company: "text", source: "text", stage: "text", department: "text", owner: "text" },
    query: () => ({}),
    load: (q) => Lead.find(q).limit(5000).lean(),
    row: (l, n) => ({ createdAt: day(l.createdAt), name: l.name, company: l.company, source: l.source, stage: l.stage, department: n.department(l.department), owner: n.person(l.owner) }),
  },
  purchases: {
    allowed: (u) => u.isStaff && !u.limited && has(u, "purchasing.request", "purchasing.approve", "assets.manage"),
    date: "createdAt",
    columns: { createdAt: "date", number: "text", title: "text", requestedBy: "text", department: "text", status: "text", currency: "text", total: "number" },
    query: (u) => purchaseScope(u),
    load: (q) => PurchaseRequest.find(q).limit(5000).lean(),
    row: (p, n) => ({ createdAt: day(p.createdAt), number: p.number, title: p.title, requestedBy: n.person(p.requestedBy), department: n.department(p.department), status: p.status, currency: p.currency, total: p.total }),
  },
  assets: {
    allowed: (u) => u.isStaff && !u.limited && has(u, "assets.manage"),
    date: "purchaseDate",
    columns: { tag: "text", name: "text", type: "text", holder: "text", branch: "text", status: "text", purchaseDate: "date", licenseExpiry: "date", cost: "number" },
    query: () => ({}),
    load: (q) => Asset.find(q).limit(5000).lean(),
    row: (a, n) => ({ tag: a.tag, name: a.name, type: a.type, holder: n.person(a.holder), branch: n.branch(a.branch), status: a.status, purchaseDate: a.purchaseDate, licenseExpiry: a.licenseExpiry, cost: a.cost }),
  },
};

export const availableDatasets = (user) => Object.entries(DATASETS).filter(([, d]) => d.allowed(user)).map(([key, d]) => ({ key, columns: d.columns, date: d.date }));

// Runs a report config { dataset, from, to, columns, filters: { column: value }, groupBy,
// measure: { column, op: count | sum | avg } }. Returns { columns, rows, groups }.
export async function runReport(user, config) {
  const ds = DATASETS[config.dataset];
  if (!ds || !ds.allowed(user)) return { error: "forbidden" };
  const lang = await viewerLang();
  const [people, projects, departments, branches] = await Promise.all([
    User.find({}, { name: 1, nameAr: 1, email: 1 }).lean(),
    WorkProject.find({}, { name: 1, code: 1 }).lean(),
    Department.find({}, { name: 1 }).lean(),
    Branch.find({}, { name: 1 }).lean(),
  ]);
  const map = (list, f) => Object.fromEntries(list.map((x) => [idStr(x._id), f(x)]));
  const P = map(people, (u) => pickName(u, lang));
  const PR = map(projects, (p) => p.code || p.name?.[lang] || p.name?.en);
  const D = map(departments, (d) => d.name?.[lang] || d.name?.en);
  const B = map(branches, (b) => b.name?.[lang] || b.name?.en);
  const names = { person: (id) => P[idStr(id)] || "", project: (id) => PR[idStr(id)] || "", department: (id) => D[idStr(id)] || "", branch: (id) => B[idStr(id)] || "" };

  const rowsAll = (await ds.load(ds.query(user) || {})).map((x) => ds.row(x, names, lang));
  const cols = Object.keys(ds.columns);
  const columns = (Array.isArray(config.columns) ? config.columns : []).filter((c) => cols.includes(c));
  const shown = columns.length ? columns : cols;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(config.from || "") ? config.from : null;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(config.to || "") ? config.to : null;
  const filters = Object.entries(config.filters || {}).filter(([k, v]) => cols.includes(k) && String(v ?? "").trim() !== "");
  const rows = rowsAll
    .filter((r) => (!from || (r[ds.date] && r[ds.date] >= from)) && (!to || (r[ds.date] && r[ds.date] <= to)))
    .filter((r) => filters.every(([k, v]) => String(r[k] ?? "").toLowerCase().includes(String(v).toLowerCase())))
    .sort((a, b) => String(b[ds.date] || "").localeCompare(String(a[ds.date] || "")));

  let groups = null;
  if (cols.includes(config.groupBy)) {
    const m = config.measure || {};
    const measureCol = cols.includes(m.column) && ds.columns[m.column] === "number" ? m.column : null;
    const op = ["sum", "avg"].includes(m.op) && measureCol ? m.op : "count";
    const by = {};
    for (const r of rows) {
      const key = String(r[config.groupBy] ?? "") || "—";
      const g = (by[key] ||= { key, count: 0, sum: 0 });
      g.count += 1;
      if (measureCol) g.sum += Number(r[measureCol]) || 0;
    }
    groups = Object.values(by)
      .map((g) => ({ key: g.key, count: g.count, value: r2(op === "count" ? g.count : op === "sum" ? g.sum : g.sum / g.count) }))
      .sort((a, b) => b.value - a.value);
  }
  return { columns: shown.map((key) => ({ key, type: ds.columns[key] })), rows: rows.slice(0, 5000).map((r) => Object.fromEntries(shown.map((k) => [k, r[k]]))), total: rows.length, groups };
}
