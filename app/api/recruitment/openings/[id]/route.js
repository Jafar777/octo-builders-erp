import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { Candidate, JobOpening } from "@/models/Recruitment";

export async function PATCH(request, { params }) {
  const user = await requirePermission("recruitment.manage");
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const o = await JobOpening.findById(id);
  if (!o) return notFound();
  const b = await readJson(request);
  if (b.title !== undefined) {
    if (!String(b.title).trim()) return fail("title_required");
    o.title = String(b.title).trim().slice(0, 150);
  }
  if (b.description !== undefined) o.description = String(b.description).slice(0, 4000);
  if (b.positions !== undefined) o.positions = Math.max(1, Math.min(50, Number(b.positions) || 1));
  if (["open", "on_hold", "closed"].includes(b.status)) o.status = b.status;
  if (b.department !== undefined) o.department = isObjectId(b.department) ? b.department : null;
  await o.save();
  return NextResponse.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const user = await requirePermission("recruitment.manage");
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  if (await Candidate.exists({ opening: id, stage: "hired" })) return fail("opening_has_hires", 409);
  await Candidate.deleteMany({ opening: id });
  await JobOpening.findByIdAndDelete(id);
  return NextResponse.json({ ok: true });
}
