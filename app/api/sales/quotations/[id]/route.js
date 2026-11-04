import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { notify, usersWithPermission } from "@/lib/notify";
import { canSeeSalesMoney, cleanQuotation, previewDelivery } from "@/lib/sales";
import { getSettings } from "@/lib/settings";
import { nextNumber } from "@/models/Counter";
import Lead from "@/models/Lead";
import ProjectIntake from "@/models/ProjectIntake";
import Quotation from "@/models/Quotation";

const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");

// { action: "edit", ...fields }        while draft or sent
// { action: "preview" }                 ask the Gantt when it would be delivered now
// { action: "send" | "reject" }
// { action: "accept" }                  → a new intake form (then the normal approval)
export async function PATCH(request, { params }) {
  const user = await requirePermission("sales.manage");
  if (!user || user.limited) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const q = await Quotation.findById(id);
  if (!q) return notFound();
  const body = await readJson(request);
  const money = canSeeSalesMoney(user);

  if (body.action === "edit") {
    if (!["draft", "sent"].includes(q.status)) return fail("quote_closed", 409);
    const v = await cleanQuotation(body, { money, settings: await getSettings(), existing: q.toObject() });
    if (v.error) return fail(v.error);
    q.set(v.value);
    q.delivery = { date: null, start: null, computedAt: null, stages: [] };
  } else if (body.action === "preview") {
    const d = await previewDelivery(q.stages.map((s) => s.toObject()), q.department);
    q.delivery = { ...d, computedAt: new Date() };
  } else if (body.action === "send" || body.action === "reject") {
    if (!["draft", "sent"].includes(q.status)) return fail("quote_closed", 409);
    q.status = body.action === "send" ? "sent" : "rejected";
    if (q.lead && body.action === "send") await Lead.updateOne({ _id: q.lead, stage: { $nin: ["won", "lost"] } }, { $set: { stage: "proposal" } });
  } else if (body.action === "accept") {
    if (!["draft", "sent"].includes(q.status)) return fail("quote_closed", 409);
    const lead = q.lead ? await Lead.findById(q.lead) : null;
    const delivery = q.delivery?.date || (await previewDelivery(q.stages.map((s) => s.toObject()), q.department)).date;
    const settings = await getSettings();
    const intake = await ProjectIntake.create({
      number: await nextNumber("intake"),
      status: "new",
      client: { name: q.clientName, phone: q.phone, receivedAt: day(new Date()), contactMethod: lead?.email || "" },
      project: { name: q.projectName, expectedDelivery: day(delivery) },
      summary: [`${q.number}`, lead?.need || "", q.notes || ""].filter(Boolean).join("\n"),
      // The accepted price is the money side (only the CEO / GM ever see it).
      ...(q.total > 0
        ? { finance: { contractValue: q.total, currency: q.currency || settings.currencies.base, rate: q.rate || 1, notes: `${q.number}`, by: user.id, at: new Date() } }
        : {}),
      createdBy: user.id,
    });
    q.status = "accepted";
    q.intake = intake._id;
    if (lead) {
      lead.stage = "won";
      await lead.save();
    }
    await notify({
      type: "sales.quote_accepted",
      recipients: await usersWithPermission("projects.intake"),
      actor: user,
      params: { client: q.clientName, project: q.projectName },
      link: "/dashboard/intake",
      entityType: "intake",
      entityId: intake._id,
    });
    await audit(user, "sales.quote_accepted", { entityType: "quotation", entityId: id, summary: `${q.number} → intake #${intake.number}` });
  } else {
    return fail("invalid_request");
  }
  await q.save();
  return NextResponse.json({ ok: true, intake: q.intake ? q.intake.toString() : null });
}

export async function DELETE(request, { params }) {
  const user = await requirePermission("sales.manage");
  if (!user || user.limited) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const q = await Quotation.findById(id);
  if (!q) return notFound();
  if (q.status === "accepted") return fail("quote_closed", 409);
  await q.deleteOne();
  return NextResponse.json({ ok: true });
}
