import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { canSeeSalesMoney } from "@/lib/sales";
import Lead, { LEAD_SOURCES, LEAD_STAGES } from "@/models/Lead";

// Any of the lead's fields, { stage }, { note } to add a note, { owner }.
export async function PATCH(request, { params }) {
  const user = await requirePermission("sales.manage");
  if (!user || user.limited) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const lead = await Lead.findById(id);
  if (!lead) return notFound();
  const b = await readJson(request);
  const str = (v, n) => String(v || "").trim().slice(0, n);
  if (b.name !== undefined) {
    if (!str(b.name, 150)) return fail("name_required");
    lead.name = str(b.name, 150);
  }
  for (const [k, n] of [["company", 150], ["phone", 40], ["email", 150], ["need", 2000], ["lostReason", 300]]) if (b[k] !== undefined) lead[k] = str(b[k], n);
  if (LEAD_SOURCES.includes(b.source)) lead.source = b.source;
  if (b.department !== undefined) lead.department = isObjectId(b.department) ? b.department : null;
  if (isObjectId(b.owner)) lead.owner = b.owner;
  if (b.nextAction) lead.nextAction = { date: /^\d{4}-\d{2}-\d{2}$/.test(b.nextAction.date || "") ? b.nextAction.date : "", note: str(b.nextAction.note, 300) };
  if (canSeeSalesMoney(user)) {
    if (b.estimatedValue !== undefined) lead.estimatedValue = Math.max(0, Number(b.estimatedValue) || 0);
    if (b.currency !== undefined) lead.currency = str(b.currency, 5);
  }
  if (LEAD_STAGES.includes(b.stage) && b.stage !== lead.stage) {
    await audit(user, "sales.lead_stage", { entityType: "lead", entityId: id, summary: `${lead.name}: ${lead.stage} → ${b.stage}` });
    lead.stage = b.stage;
  }
  if (b.note && str(b.note, 2000)) lead.notes.push({ text: str(b.note, 2000), by: user.id });
  await lead.save();
  return NextResponse.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const user = await requirePermission("sales.manage");
  if (!user || user.limited) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const lead = await Lead.findByIdAndDelete(id);
  if (!lead) return notFound();
  await audit(user, "sales.lead_deleted", { entityType: "lead", entityId: id, summary: lead.name });
  return NextResponse.json({ ok: true });
}
