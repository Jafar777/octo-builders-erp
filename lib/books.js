import Branch from "@/models/Branch";
import Budget from "@/models/Budget";
import Client from "@/models/Client";
import FinanceEntry from "@/models/FinanceEntry";
import FundTransfer from "@/models/FundTransfer";
import Invoice from "@/models/Invoice";
import JournalEntry from "@/models/JournalEntry";
import User from "@/models/User";
import WorkProject from "@/models/WorkProject";
import Task from "@/models/Task";
import { nextNumber } from "@/models/Counter";
import { localParts } from "@/lib/attendance";
import { isSalaryCategory, toBase } from "@/lib/financeEngine";
import { monthRange, rateOf, salaryCosts } from "@/lib/finance";
import { buildJournal } from "@/lib/ledgerEngine";
import { finishTime } from "@/lib/gantt";
import { getSettings } from "@/lib/settings";
import { DEFAULT_ROLE } from "@/lib/permissions";

// The books, loaded from the database (lib/ledgerEngine.js does the accounting).

const idStr = (v) => (v ? v.toString() : null);
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export async function today() {
  const settings = await getSettings();
  return localParts(new Date(), settings.hr.timezone).date;
}

// Everything the journal needs, and the journal itself.
export async function loadBooks() {
  const settings = await getSettings();
  const [entries, transfers, invoices, journals, staff] = await Promise.all([
    FinanceEntry.find().lean(),
    FundTransfer.find().lean(),
    Invoice.find({ status: { $ne: "void" } }).lean(),
    JournalEntry.find().lean(),
    User.find({ role: { $ne: DEFAULT_ROLE } }, { branch: 1, status: 1, contractStart: 1, contractEnd: 1 }).lean(),
  ]);
  const now = await today();
  const first = [now.slice(0, 7), ...entries.map((e) => e.date.slice(0, 7)), ...journals.map((j) => j.date.slice(0, 7))].sort()[0];
  const { salaries } = await salaryCosts(monthRange(first, now.slice(0, 7)), settings, staff);
  const salaryCategories = settings.finance.expenseCategories.filter(isSalaryCategory).map((c) => c.key);
  const journal = buildJournal({
    entries: entries.map((e) => ({ ...e, project: idStr(e.project), branch: idStr(e.branch) })),
    transfers: transfers.map((t) => ({ ...t, fromBranch: idStr(t.fromBranch), toBranch: idStr(t.toBranch) })),
    salaries,
    invoices: invoices.map((i) => ({ ...i, project: idStr(i.project), branch: idStr(i.branch) })),
    journals,
    salaryCategories,
  });
  return { settings, entries, transfers, invoices, journals, salaries, journal, today: now };
}

// The invoice as the screens show it, with what's been paid on it (`paid` from the journal).
export function serializeInvoice(inv, paid, names = {}) {
  const p = paid?.[idStr(inv._id)];
  const rate = inv.rate || 1;
  const outstandingBase = inv.status === "issued" ? (p ? p.outstandingBase : inv.baseTotal) : 0;
  const paidBase = p ? p.paidBase : 0;
  const state = inv.status !== "issued" ? inv.status : outstandingBase <= 0.01 ? "paid" : paidBase > 0 ? "partial" : "issued";
  return {
    id: idStr(inv._id),
    number: inv.number,
    status: inv.status,
    state,
    project: idStr(inv.project),
    projectName: names.projects?.[idStr(inv.project)] || null,
    milestone: idStr(inv.milestone),
    client: idStr(inv.client),
    clientName: inv.clientName || names.clients?.[idStr(inv.client)] || "",
    branch: idStr(inv.branch),
    currency: inv.currency,
    rate,
    items: inv.items || [],
    total: inv.total,
    baseTotal: inv.baseTotal,
    paid: r2(paidBase * rate),
    outstanding: r2(outstandingBase * rate),
    paidBase,
    outstandingBase,
    paidDate: p?.paidDate || null,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    notes: inv.notes || "",
    voidReason: inv.voidReason || "",
    createdAt: inv.createdAt,
  };
}

// The contract of a project: its contract + adjustment entries in base, and the
// currency it was agreed in (the first contract entry's).
export async function projectContract(projectId) {
  const list = await FinanceEntry.find({ project: projectId, kind: { $in: ["contract", "adjustment"] } }).sort({ date: 1 }).lean();
  const base = r2(list.reduce((s, e) => s + e.baseAmount, 0));
  const first = list.find((e) => e.kind === "contract");
  return { base, currency: first?.currency || null, rate: first?.rate || null };
}

const isId = (v) => /^[a-f0-9]{24}$/i.test(String(v || ""));

// Validated invoice fields: { project, client, clientName, branch, currency, rate, items,
// dueDate, notes }. Returns { value } or { error }.
export async function cleanInvoice(body, settings) {
  const items = (Array.isArray(body.items) ? body.items : [])
    .map((x) => ({ description: String(x?.description || "").trim().slice(0, 300), amount: Number(x?.amount) }))
    .filter((x) => x.description || x.amount);
  if (!items.length || items.some((x) => !Number.isFinite(x.amount) || Math.abs(x.amount) > 1e11)) return { error: "invalid_amount" };
  const total = r2(items.reduce((s, x) => s + x.amount, 0));
  if (total <= 0) return { error: "invalid_amount" };
  const currency = String(body.currency || settings.currencies.base).toUpperCase();
  const configured = rateOf(settings.currencies, currency);
  if (!configured) return { error: "invalid_currency" };
  const rate = currency === settings.currencies.base ? 1 : Number(body.rate) > 0 ? Number(body.rate) : configured;
  const value = {
    items,
    total,
    currency,
    rate,
    baseTotal: toBase(total, rate),
    project: isId(body.project) ? body.project : null,
    client: isId(body.client) ? body.client : null,
    clientName: String(body.clientName || "").trim().slice(0, 200),
    branch: isId(body.branch) ? body.branch : null,
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate || "") ? body.dueDate : "",
    notes: String(body.notes || "").trim().slice(0, 1000),
  };
  // Payments settle invoices per project (or per client): one of them is needed.
  if (!value.project && !value.client) return { error: "invoice_needs_project" };
  if (value.project && !(await WorkProject.exists({ _id: value.project }))) return { error: "invalid_project" };
  if (value.client && !(await Client.exists({ _id: value.client }))) return { error: "invalid_client" };
  if (value.branch && !(await Branch.exists({ _id: value.branch }))) return { error: "invalid_branch" };
  return { value };
}

// INV-2026-0007: numbered when issued, never reused.
export async function invoiceNumber(issueDate) {
  const year = issueDate.slice(0, 4);
  return `INV-${year}-${String(await nextNumber(`invoice-${year}`)).padStart(4, "0")}`;
}

// A Gantt milestone with billing was reached: a draft invoice for its share of the
// contract (percent of the contract, or its fixed amount). Sets milestone.invoice; the
// caller saves the project. Returns the invoice or null.
export async function draftMilestoneInvoice(project, milestone, actorId) {
  if (milestone.invoice || !(milestone.billPercent > 0 || milestone.billAmount > 0)) return null;
  const settings = await getSettings();
  const contract = await projectContract(project._id);
  const branch = project.branch ? await Branch.findById(project.branch).lean() : null;
  const currency = contract.currency || branch?.currency || settings.currencies.base;
  const rate = currency === settings.currencies.base ? 1 : contract.rate || rateOf(settings.currencies, currency) || 1;
  const amount = milestone.billAmount > 0 ? milestone.billAmount : r2((contract.base * rate * milestone.billPercent) / 100);
  if (!(amount > 0)) return null;
  const projectName = project.name?.ar || project.name?.en || "";
  const share = milestone.billPercent > 0 && !(milestone.billAmount > 0) ? ` (${milestone.billPercent}%)` : "";
  const invoice = await Invoice.create({
    status: "draft",
    project: project._id,
    milestone: milestone._id,
    clientName: project.client || "",
    branch: project.branch || null,
    currency,
    rate,
    items: [{ description: `${projectName} — ${milestone.name}${share}`, amount }],
    total: amount,
    baseTotal: toBase(amount, rate),
    createdBy: actorId,
  });
  milestone.invoice = invoice._id;
  return invoice;
}

// When the Gantt expects a milestone: its own date, or later when a task it waits for
// is planned to end after it.
export function milestoneForecast(m, tasksById) {
  const own = new Date(m.date).getTime();
  const waits = (m.dependsOn || []).map((id) => tasksById[idStr(id)]).filter(Boolean).map((t) => finishTime(t)).filter(Number.isFinite);
  return new Date(Math.max(own, ...waits));
}

// Milestone billings not invoiced yet, with the date the Gantt expects them plus the
// payment terms (for the cash forecast), in base currency.
export async function plannedBillings(settings, paymentDays = 14) {
  const projects = await WorkProject.find({ status: { $in: ["active", "on_hold"] }, "milestones.0": { $exists: true } }, { milestones: 1, name: 1 }).lean();
  const taskIds = projects.flatMap((p) => p.milestones.flatMap((m) => m.dependsOn || []));
  const tasks = await Task.find({ _id: { $in: taskIds } }, { plannedStart: 1, dueAt: 1, expectedEnd: 1, status: 1, submittedAt: 1, estimatedHours: 1, maxHours: 1, startedAt: 1, activeMs: 1 }).lean();
  const byId = Object.fromEntries(tasks.map((t) => [idStr(t._id), t]));
  const out = [];
  for (const p of projects) {
    const billable = p.milestones.filter((m) => !m.invoice && !m.doneAt && (m.billPercent > 0 || m.billAmount > 0));
    if (!billable.length) continue;
    const contract = await projectContract(p._id);
    for (const m of billable) {
      const base = m.billAmount > 0 ? toBase(m.billAmount, contract.rate || 1) : r2((contract.base * m.billPercent) / 100);
      if (!(base > 0)) continue;
      const at = milestoneForecast(m, byId);
      at.setUTCDate(at.getUTCDate() + paymentDays);
      out.push({ project: idStr(p._id), projectName: p.name, milestone: m.name, date: localParts(at, settings.hr.timezone).date, baseAmount: base });
    }
  }
  return out;
}

export const loadBudgets = (year) => Budget.find({ year: String(year) }).lean();
