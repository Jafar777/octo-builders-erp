import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/currentUser";
import { fail, forbidden, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { cleanInvoice, loadBooks, serializeInvoice } from "@/lib/books";
import { agingBucket, AGING_BUCKETS } from "@/lib/ledgerEngine";
import Client from "@/models/Client";
import Invoice from "@/models/Invoice";
import WorkProject from "@/models/WorkProject";

const idStr = (v) => (v ? v.toString() : null);
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const canSeeInvoices = (u) => hasPermission(u, "invoices.manage") || hasPermission(u, "finance.view");

// Invoices with what's paid on each, money owed by age, and per client.
// ?project=<id> narrows to one project.
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user?.isStaff || user.limited || !canSeeInvoices(user)) return forbidden();
  const raw = new URL(request.url).searchParams.get("project");
  const project = /^[a-f0-9]{24}$/i.test(raw || "") ? raw : null;
  const { journal, today, settings } = await loadBooks();
  const all = await Invoice.find(project ? { project } : {}).sort({ createdAt: -1 }).limit(1000).lean();
  const [projects, clients] = await Promise.all([
    WorkProject.find({ _id: { $in: all.map((i) => i.project).filter(Boolean) } }, { name: 1, code: 1 }).lean(),
    Client.find({ _id: { $in: all.map((i) => i.client).filter(Boolean) } }, { name: 1 }).lean(),
  ]);
  const names = {
    projects: Object.fromEntries(projects.map((p) => [idStr(p._id), p.code || p.name?.ar || p.name?.en])),
    clients: Object.fromEntries(clients.map((c) => [idStr(c._id), c.name])),
  };
  const list = all.map((i) => serializeInvoice(i, journal.invoices, names)).map((i) => ({
    ...i,
    aging: i.state === "issued" || i.state === "partial" ? agingBucket(i.dueDate, today) : null,
  }));

  // Money owed (base currency) by age, and per client.
  const aging = Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0]));
  const byClient = {};
  for (const i of list) {
    if (!i.aging) continue;
    aging[i.aging] = r2(aging[i.aging] + i.outstandingBase);
    const key = i.client || i.clientName || "—";
    const row = (byClient[key] ||= { client: i.clientName || "—", outstandingBase: 0, invoices: 0, oldestDue: i.dueDate });
    row.outstandingBase = r2(row.outstandingBase + i.outstandingBase);
    row.invoices += 1;
    if (i.dueDate && (!row.oldestDue || i.dueDate < row.oldestDue)) row.oldestDue = i.dueDate;
  }
  return NextResponse.json({
    invoices: list,
    aging,
    clients: Object.values(byClient).sort((a, b) => b.outstandingBase - a.outstandingBase),
    base: settings.currencies.base,
    today,
    canManage: hasPermission(user, "invoices.manage"),
  });
}

// A new draft invoice.
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user?.isStaff || !hasPermission(user, "invoices.manage")) return forbidden();
  const { settings } = await loadBooks();
  const v = await cleanInvoice(await readJson(request), settings);
  if (v.error) return fail(v.error);
  const invoice = await Invoice.create({ ...v.value, status: "draft", createdBy: user.id });
  await audit(user, "invoice.created", { entityType: "invoice", entityId: invoice._id, summary: `${invoice.total} ${invoice.currency}` });
  return NextResponse.json({ id: idStr(invoice._id) }, { status: 201 });
}
