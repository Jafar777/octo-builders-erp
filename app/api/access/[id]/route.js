import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { effectiveAccess, isHiddenRole, isTopRole } from "@/lib/permissions";
import { publish, userChannel } from "@/lib/realtime/server";
import { cleanAccessBody, escalation } from "@/lib/roles";
import Role from "@/models/Role";
import User from "@/models/User";
import Department from "@/models/Department";

const diff = (a = [], b = []) => ({ added: b.filter((x) => !a.includes(x)), removed: a.filter((x) => !b.includes(x)) });

// One person's exceptions to their role: extra or removed permissions, another data
// scope, hidden pages. { grant, deny, scope, hiddenPages, note }
export async function PATCH(request, { params }) {
  const actor = await requirePermission("roles.manage");
  if (!actor) return forbidden();

  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const target = await User.findById(id);
  if (!target) return notFound();
  if (isHiddenRole(target.role) && !isHiddenRole(actor.role)) return notFound();
  // The CEO always has everything (exceptions don't apply), and nobody edits their own.
  if (isTopRole(target.role)) return fail("top_role_fixed", 409);
  if (id === actor.id) return fail("cannot_change_own_access", 403);

  const data = cleanAccessBody(await readJson(request));
  const role = await Role.findOne({ key: target.role }).lean();
  const before = effectiveAccess(role, target.access, target.role);
  const after = effectiveAccess(role, data, target.role);
  const why = escalation(actor, before.permissions, after.permissions, after.scope !== before.scope ? after.scope : null);
  if (why) return fail(why, 403);

  const old = target.access?.toObject?.() || {};
  if (data.workDepartments.length && (await Department.countDocuments({ _id: { $in: data.workDepartments } })) !== data.workDepartments.length) {
    return fail("invalid_department");
  }
  target.access = data;
  await target.save();

  await audit(actor, "access.updated", {
    entityType: "user",
    entityId: id,
    summary: target.email,
    details: {
      grant: diff(old.grant, data.grant),
      deny: diff(old.deny, data.deny),
      hiddenPages: diff(old.hiddenPages, data.hiddenPages),
      workDepartments: diff((old.workDepartments || []).map(String), data.workDepartments),
      crossDepartment: (old.crossDepartment ?? null) !== data.crossDepartment ? { from: old.crossDepartment ?? null, to: data.crossDepartment } : undefined,
      scope: (old.scope || null) !== data.scope ? { from: old.scope || null, to: data.scope } : undefined,
    },
  });
  // They see the change right away (navigation, pages, buttons).
  await publish([userChannel(id)], "user:updated", {});
  return NextResponse.json({ ok: true, access: data });
}
