import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { isHiddenRole, isTopRole } from "@/lib/permissions";
import { serializeLogin } from "@/lib/security";
import LoginEvent from "@/models/LoginEvent";
import User from "@/models/User";

// One person's sign-in security, for the CEO (Roles page → People): their login
// history and whether they use an authenticator app.
export async function GET(request, { params }) {
  const actor = await requirePermission("roles.manage");
  if (!actor) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const user = await User.findById(id, { mfa: 1, role: 1 }).lean();
  if (!user || (isHiddenRole(user.role) && !isHiddenRole(actor.role))) return notFound();
  const logins = await LoginEvent.find({ user: id }).sort({ at: -1 }).limit(30).lean();
  return NextResponse.json({ mfaEnabled: Boolean(user.mfa?.enabled), mfaEnabledAt: user.mfa?.enabledAt || null, logins: logins.map(serializeLogin) });
}

// Lost phone: the CEO removes their authenticator app so they can set it up again.
export async function DELETE(request, { params }) {
  const actor = await requirePermission("roles.manage");
  if (!actor || !isTopRole(actor.role)) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  if (id === actor.id) return fail("cannot_change_own_access", 403);
  const user = await User.findById(id);
  if (!user || (isHiddenRole(user.role) && !isHiddenRole(actor.role))) return notFound();
  Object.assign(user.mfa, { enabled: false, secret: "", pending: "", lastCounter: -1, enabledAt: null });
  await user.save();
  await audit(actor, "security.mfa_reset", { entityType: "user", entityId: id, summary: user.email });
  return NextResponse.json({ ok: true });
}
