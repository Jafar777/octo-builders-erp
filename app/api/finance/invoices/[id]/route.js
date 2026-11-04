import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { cleanInvoice, invoiceNumber, loadBooks, today } from "@/lib/books";
import { cleanMoney } from "@/lib/finance";
import { getSettings } from "@/lib/settings";
import FinanceEntry from "@/models/FinanceEntry";
import Invoice from "@/models/Invoice";
import WorkProject from "@/models/WorkProject";

const dateOk = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "");

// { action: "edit", ...fields }  a draft only
// { action: "issue", issueDate?, dueDate? }  numbers it and books it (receivable + revenue)
// { action: "void", reason }  cancels an issued invoice (its payments stay as advances)
// { action: "payment", amount, date, branch?, rate? }  records money received on it
export async function PATCH(request, { params }) {
  const user = await requirePermission("invoices.manage");
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const invoice = await Invoice.findById(id);
  if (!invoice) return notFound();
  const body = await readJson(request);
  const settings = await getSettings();

  if (body.action === "edit") {
    if (invoice.status !== "draft") return fail("invoice_not_draft", 409);
    const v = await cleanInvoice({ ...invoice.toObject(), ...body }, settings);
    if (v.error) return fail(v.error);
    invoice.set(v.value);
    await invoice.save();
    return NextResponse.json({ ok: true });
  }

  if (body.action === "issue") {
    if (invoice.status !== "draft") return fail("invoice_not_draft", 409);
    const issueDate = dateOk(body.issueDate) ? body.issueDate : await today();
    const due = dateOk(body.dueDate) ? body.dueDate : invoice.dueDate || issueDate;
    Object.assign(invoice, { status: "issued", issueDate, dueDate: due < issueDate ? issueDate : due, number: await invoiceNumber(issueDate), issuedBy: user.id });
    await invoice.save();
    await audit(user, "invoice.issued", { entityType: "invoice", entityId: id, summary: `${invoice.number} · ${invoice.total} ${invoice.currency}` });
    return NextResponse.json({ ok: true, number: invoice.number });
  }

  if (body.action === "void") {
    if (invoice.status !== "issued") return fail("invoice_not_issued", 409);
    invoice.status = "void";
    invoice.voidReason = String(body.reason || "").trim().slice(0, 300);
    await invoice.save();
    // The milestone can be billed again.
    if (invoice.project && invoice.milestone) {
      await WorkProject.updateOne({ _id: invoice.project, "milestones._id": invoice.milestone }, { $set: { "milestones.$.invoice": null } });
    }
    await audit(user, "invoice.voided", { entityType: "invoice", entityId: id, summary: `${invoice.number} · ${invoice.voidReason}` });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "payment") {
    if (invoice.status !== "issued") return fail("invoice_not_issued", 409);
    if (!dateOk(body.date)) return fail("invalid_date");
    const money = cleanMoney({ amount: body.amount, currency: invoice.currency, rate: body.rate || invoice.rate }, settings.currencies);
    if (money.error || !(money.amount > 0)) return fail(money.error || "invalid_amount");
    const branch = isObjectId(body.branch) ? body.branch : invoice.branch;
    const entry = await FinanceEntry.create({
      kind: "payment",
      project: invoice.project,
      client: invoice.client,
      branch,
      date: body.date,
      description: `${invoice.number}${body.note ? ` · ${String(body.note).slice(0, 200)}` : ""}`,
      amount: money.amount,
      currency: money.currency,
      rate: money.rate,
      baseAmount: money.baseAmount,
      createdBy: user.id,
    });
    await audit(user, "invoice.paid", { entityType: "invoice", entityId: id, summary: `${invoice.number} · ${money.amount} ${money.currency}` });
    const { journal } = await loadBooks();
    return NextResponse.json({ ok: true, entry: entry._id.toString(), status: journal.invoices[id] || null });
  }

  return fail("invalid_request");
}

// Deletes a draft (issued invoices are voided instead, so the numbers stay unbroken).
export async function DELETE(request, { params }) {
  const user = await requirePermission("invoices.manage");
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const invoice = await Invoice.findById(id);
  if (!invoice) return notFound();
  if (invoice.status !== "draft") return fail("invoice_not_draft", 409);
  if (invoice.project && invoice.milestone) {
    await WorkProject.updateOne({ _id: invoice.project, "milestones._id": invoice.milestone }, { $set: { "milestones.$.invoice": null } });
  }
  await invoice.deleteOne();
  return NextResponse.json({ ok: true });
}
