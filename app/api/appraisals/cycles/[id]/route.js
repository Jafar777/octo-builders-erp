import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import Appraisal, { AppraisalCycle } from "@/models/Appraisal";

// { status: "open" | "closed" }, or { reviewer, appraisal } to change who writes one review.
export async function PATCH(request, { params }) {
  const user = await requirePermission("appraisals.manage");
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const cycle = await AppraisalCycle.findById(id);
  if (!cycle) return notFound();
  const b = await readJson(request);
  if (b.status === "open" || b.status === "closed") {
    cycle.status = b.status;
    await cycle.save();
    await audit(user, `appraisals.cycle_${b.status}`, { entityType: "appraisal_cycle", entityId: id, summary: cycle.name });
  } else if (isObjectId(b.appraisal) && isObjectId(b.reviewer)) {
    await Appraisal.updateOne({ _id: b.appraisal, cycle: id }, { $set: { reviewer: b.reviewer } });
  } else {
    return fail("invalid_request");
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const user = await requirePermission("appraisals.manage");
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const cycle = await AppraisalCycle.findByIdAndDelete(id);
  if (!cycle) return notFound();
  await Appraisal.deleteMany({ cycle: id });
  await audit(user, "appraisals.cycle_deleted", { entityType: "appraisal_cycle", entityId: id, summary: cycle.name });
  return NextResponse.json({ ok: true });
}
