import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { forbidden, isObjectId, notFound } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { canSeePerson } from "@/lib/hrAccess";
import User from "@/models/User";

// Remove a document: HR, or whoever uploaded it.
export async function DELETE(request, { params }) {
  const user = await requireStaff({ limited: true });
  const { id, docId } = await params;
  if (!user || !isObjectId(id) || !isObjectId(docId)) return forbidden();
  const target = await User.findById(id);
  const doc = target?.documents.id(docId);
  if (!doc) return notFound();
  const isHr = hasPermission(user, "attendance.manage") && (await canSeePerson(user, id, "attendance.manage"));
  if (!isHr && doc.uploadedBy?.toString() !== user.id) return forbidden();

  doc.deleteOne();
  await target.save();
  await audit(user, "hr.document_deleted", { entityType: "user", entityId: id, summary: doc.name });
  return NextResponse.json({ ok: true });
}
