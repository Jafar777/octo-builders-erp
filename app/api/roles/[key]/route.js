import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { CODER_ROLE, DEFAULT_ROLE, isTopRole } from "@/lib/permissions";
import { publish, userChannel } from "@/lib/realtime/server";
import { isBilingualComplete } from "@/lib/validateBilingual";
import { cleanRoleBody, escalation, serializeRole, trimRestricted } from "@/lib/roles";
import { syncStaffChannels } from "@/lib/messaging";
import Role from "@/models/Role";
import User from "@/models/User";

// The role's holders reload their navigation and data right away.
async function refreshHolders(key) {
  const users = await User.find({ role: key }, { _id: 1 }).lean();
  await publish(
    users.map((u) => userChannel(u._id.toString())),
    "user:updated",
    {}
  );
}

const diff = (a = [], b = []) => ({ added: b.filter((x) => !a.includes(x)), removed: a.filter((x) => !b.includes(x)) });

export async function PATCH(request, { params }) {
  const actor = await requirePermission("roles.manage");
  if (!actor) return forbidden();

  const { key } = await params;
  const role = await Role.findOne({ key });
  if (!role) return notFound();
  // Only a coder may touch the hidden coder role.
  if (key === CODER_ROLE && actor.role !== CODER_ROLE) return notFound();
  // Below the CEO: not the top roles, and not their own role.
  if (!isTopRole(actor.role) && (isTopRole(key) || key === actor.role)) return forbidden();

  const data = trimRestricted(cleanRoleBody(await readJson(request)));
  if (!isBilingualComplete(data.name)) return fail("bilingual_required");

  // The CEO (and coder) role always keeps everything — the company can never lock itself
  // out — and the no-access role never gets anything. Every other role, the GM too, is
  // whatever the CEO makes it.
  if (isTopRole(key)) Object.assign(data, { permissions: role.permissions, scope: "all", limited: false, pages: [], crossDepartment: true });
  if (key === DEFAULT_ROLE) Object.assign(data, { permissions: [], limited: false, pages: [] });

  const why = escalation(actor, role.permissions, data.permissions, data.scope !== role.scope ? data.scope : null);
  if (why) return fail(why, 403);

  const before = {
    permissions: role.permissions,
    scope: role.scope,
    limited: Boolean(role.limited),
    pages: role.pages || [],
    crossDepartment: Boolean(role.crossDepartment),
    name: role.name,
  };
  const wasLimited = Boolean(role.limited);
  role.set(data);
  await role.save();

  await audit(actor, "role.updated", {
    entityType: "role",
    entityId: key,
    summary: data.name.en,
    details: {
      permissions: diff(before.permissions, data.permissions),
      pages: diff(before.pages, data.pages),
      scope: before.scope !== data.scope ? { from: before.scope, to: data.scope } : undefined,
      limited: before.limited !== data.limited ? { from: before.limited, to: data.limited } : undefined,
      crossDepartment: before.crossDepartment !== data.crossDepartment ? { from: before.crossDepartment, to: data.crossDepartment } : undefined,
    },
  });
  await refreshHolders(key);
  // Joining / leaving the organization moves them in or out of the staff chats.
  if (wasLimited !== data.limited) await syncStaffChannels();

  return NextResponse.json({ role: serializeRole(role.toObject(), await User.countDocuments({ role: key })) });
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
