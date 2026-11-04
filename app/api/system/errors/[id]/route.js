import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { forbidden, isObjectId, notFound } from "@/lib/apiUtils";
import ErrorLog from "@/models/ErrorLog";

// Mark an error resolved (it comes back, with a new notification, if it happens again).
export async function PATCH(request, { params }) {
  const user = await requirePermission("system.health");
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const { resolved } = await request.json().catch(() => ({}));
  const e = await ErrorLog.findByIdAndUpdate(id, resolved === false ? { resolvedAt: null, resolvedBy: null } : { resolvedAt: new Date(), resolvedBy: user.id }, { new: true });
  if (!e) return notFound();
  return NextResponse.json({ ok: true });
}
