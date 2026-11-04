import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { canSeePerson, serializeDocument } from "@/lib/hrAccess";
import User from "@/models/User";

// Add a document (already uploaded to ImageKit) to an HR file.
// HR, or the employee for their own file. Body: { name, url, fileId, mime, size }
export async function POST(request, { params }) {
  const user = await requireStaff({ limited: true });
  const { id } = await params;
  if (!user || !isObjectId(id)) return forbidden();
  const isHr = hasPermission(user, "attendance.manage") && (await canSeePerson(user, id, "attendance.manage"));
  if (!isHr && id !== user.id) return forbidden();

  const body = await readJson(request);
  if (typeof body.url !== "string" || !/^https:\/\//.test(body.url)) return fail("invalid_request");
  const target = await User.findById(id);
  if (!target) return notFound();
  if ((target.documents || []).length >= 50) return fail("too_many_documents");
  target.documents.push({
    name: String(body.name || "document").slice(0, 150),
    url: body.url.slice(0, 1000),
    fileId: String(body.fileId || "").slice(0, 100),
    mime: String(body.mime || "").slice(0, 100),
    size: Number(body.size) || 0,
    uploadedBy: user.id,
  });
  await target.save();
  const doc = target.documents.at(-1);
  await audit(user, "hr.document_added", { entityType: "user", entityId: id, summary: doc.name });
  return NextResponse.json({ document: serializeDocument(doc) }, { status: 201 });
}
