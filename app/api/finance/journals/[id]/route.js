import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { forbidden, isObjectId, notFound } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import JournalEntry from "@/models/JournalEntry";

export async function DELETE(request, { params }) {
  const user = await requirePermission("finance.manage");
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const j = await JournalEntry.findByIdAndDelete(id);
  if (!j) return notFound();
  await audit(user, "finance.journal_deleted", { entityType: "journal", entityId: id, summary: j.memo });
  return NextResponse.json({ ok: true });
}
