import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { DEFAULT_ROLE, PERMISSION_KEYS } from "@/lib/permissions";
import { publish, userChannel } from "@/lib/realtime/server";
import { isBilingualComplete } from "@/lib/validateBilingual";
import { cleanRoleBody, serializeRole } from "@/lib/roles";
import Role from "@/models/Role";
import User from "@/models/User";

async function refreshHolders(key) {
  const users = await User.find({ role: key }, { _id: 1 }).lean();
  await publish(
    users.map((u) => userChannel(u._id.toString())),
    "user:updated",
    {}
  );
}

export async function PATCH(request, { params }) {
  const actor = await requirePermission("roles.manage");
  if (!actor) return forbidden();

  const { key } = await params;
  const role = await Role.findOne({ key });
  if (!role) return notFound();

  const data = cleanRoleBody(await readJson(request));
  if (!isBilingualComplete(data.name)) return fail("bilingual_required");

  // The GM role always keeps everything; the no-access role never gets anything.
  if (key === "gm") {
    data.permissions = PERMISSION_KEYS;
    data.scope = "all";
  }
  if (key === DEFAULT_ROLE) data.permissions = [];

  const before = { permissions: role.permissions, scope: role.scope, name: role.name };
  role.set(data);
  await role.save();

  await audit(actor, "role.updated", { entityType: "role", entityId: key, summary: data.name.en, details: { before, after: data } });
  await refreshHolders(key);

  return NextResponse.json({ role: serializeRole(role.toObject()) });
}

export async function DELETE(request, { params }) {
  const actor = await requirePermission("roles.manage");
  if (!actor) return forbidden();

  const { key } = await params;
  const role = await Role.findOne({ key });
  if (!role) return notFound();
  if (role.system) return fail("system_role", 409);
  if (await User.exists({ role: key })) return fail("role_in_use", 409);

  await role.deleteOne();
  await audit(actor, "role.deleted", { entityType: "role", entityId: key, summary: role.name?.en });
  return NextResponse.json({ ok: true });
}
