import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { checkMerge, endMerge, parseEndsAt, serializeMerge, updateMerge } from "@/lib/departmentMerge";
import DepartmentMerge from "@/models/DepartmentMerge";

async function load(params) {
  const { id } = await params;
  if (!isObjectId(id)) return null;
  return DepartmentMerge.findOne({ _id: id, status: "active" });
}

// Change a live merge: its manager, end date or note.
export async function PATCH(request, { params }) {
  const actor = await requirePermission("org.manage");
  if (!actor) return forbidden();
  const merge = await load(params);
  if (!merge) return notFound();
  const body = await readJson(request);

  const managerId = isObjectId(body.managerId) ? String(body.managerId) : merge.manager.toString();
  const endsAt = "endsAt" in body ? parseEndsAt(body.endsAt) : merge.endsAt;
  if (endsAt === undefined) return fail("invalid_request");
  const error = await checkMerge({ departments: merge.departments.map(String), managerId, endsAt }, merge._id);
  if (error) return fail(error);

  await updateMerge(actor, merge, {
    managerId,
    endsAt,
    note: typeof body.note === "string" ? body.note.trim().slice(0, 300) : undefined,
  });
  return NextResponse.json({ merge: serializeMerge(merge.toObject()) });
}

// End the merge now: everything goes back to how it was.
export async function DELETE(request, { params }) {
  const actor = await requirePermission("org.manage");
  if (!actor) return forbidden();
  const merge = await load(params);
  if (!merge) return notFound();
  await endMerge(actor, merge);
  return NextResponse.json({ merge: serializeMerge(merge.toObject()) });
}
