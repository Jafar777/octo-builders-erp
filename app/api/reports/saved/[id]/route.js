import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { forbidden, isObjectId, notFound } from "@/lib/apiUtils";
import SavedReport from "@/models/SavedReport";

export async function DELETE(request, { params }) {
  const user = await requirePermission("reports.build");
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const r = await SavedReport.findOneAndDelete({ _id: id, owner: user.id });
  return r ? NextResponse.json({ ok: true }) : notFound();
}
