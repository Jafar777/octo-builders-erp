import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { syncStaffChannels } from "@/lib/messaging";
import { publish, userChannel } from "@/lib/realtime/server";
import { cleanNameParts, viewerLang } from "@/lib/personName";
import { serializeStaff } from "@/lib/staff";
import User from "@/models/User";
import Role from "@/models/Role";
import Department from "@/models/Department";
import Branch from "@/models/Branch";
import JobTitle from "@/models/JobTitle";
import Task from "@/models/Task";
import { DEFAULT_ROLE, isHiddenRole, isTopRole } from "@/lib/permissions";
import { usersWithPermissionFor } from "@/lib/scope";
import { ACTIVE_STATUSES } from "@/lib/tasks";
import { isTrainingAdmin } from "@/lib/training";

const idStr = (v) => (v ? v.toString() : null);
const REF_FIELDS = { department: Department, branch: Branch, jobTitle: JobTitle };

// Assign role / department / branch / job title / status / phone / badge ID.
export async function PATCH(request, { params }) {
  const actor = await requirePermission("users.manage");
  if (!actor) return forbidden();

  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const target = await User.findById(id);
  if (!target) return notFound();

  const body = await readJson(request);
  // The hidden coder accounts and role are a coder's alone.
  if ((isHiddenRole(target.role) || isHiddenRole(body.role)) && !isHiddenRole(actor.role)) return notFound();
  const before = serializeStaff(target.toObject());
  const changes = {};

  if (typeof body.role === "string" && body.role !== before.role) {
    // Nobody changes their own role, so the company can't lock itself out.
    if (id === actor.id) return fail("cannot_change_own_role", 403);
    // Only the CEO gives or takes the CEO role.
    if ((isTopRole(body.role) || isTopRole(before.role)) && !isTopRole(actor.role)) return forbidden();
    const role = await Role.findOne({ key: body.role }).lean();
    if (!role) return fail("invalid_role");
    if (before.role === "ceo") {
      const ceos = await User.countDocuments({ role: "ceo", status: "active" });
      if (ceos <= 1) return fail("last_gm", 409);
    }
    changes.role = body.role;
  }

  for (const [field, Model] of Object.entries(REF_FIELDS)) {
    if (!(field in body)) continue;
    const value = body[field];
    if (value === null || value === "") changes[field] = null;
    else if (isObjectId(value) && (await Model.exists({ _id: value }))) changes[field] = value;
    else return fail(`invalid_${field}`);
  }

  // Other departments a department manager heads too (lib/scope.js userDepartments).
  if (Array.isArray(body.managedDepartments)) {
    const own = idStr(changes.department !== undefined ? changes.department : target.department);
    const ids = [...new Set(body.managedDepartments.filter(isObjectId))].filter((d) => d !== own);
    if ((await Department.countDocuments({ _id: { $in: ids } })) !== ids.length) return fail("invalid_department");
    changes.managedDepartments = ids;
  }

  if (body.status === "active" || body.status === "inactive") {
    if (id === actor.id && body.status === "inactive") return fail("cannot_deactivate_self", 403);
    changes.status = body.status;
  }
  if (typeof body.phone === "string") changes.phone = body.phone.trim().slice(0, 30);
  if (typeof body.badgeId === "string") changes.badgeId = body.badgeId.trim().slice(0, 20);
  // One fingerprint ID per person: two people with the same ID would share their punches
  // (HR → Fingerprint moves an ID from one person to another).
  if (changes.badgeId && (await User.exists({ badgeId: changes.badgeId, _id: { $ne: id } }))) return fail("badge_in_use", 409);
  // Only the GM / CEO decide who is a trainee.
  if (typeof body.trainee === "boolean" && body.trainee !== before.trainee) {
    if (!isTrainingAdmin(actor)) return forbidden();
    changes.trainee = body.trainee;
  }
  if (body.firstName !== undefined || body.lastName !== undefined) {
    const names = cleanNameParts(body.firstName, body.lastName);
    if (names.error) return fail(names.error);
    Object.assign(changes, names);
  }

  target.set(changes);
  await target.save();
  const after = serializeStaff(target.toObject(), await viewerLang());

  await audit(actor, "user.updated", {
    entityType: "user",
    entityId: id,
    summary: target.email,
    details: { before, after: changes },
  });

  if (changes.role) {
    const role = await Role.findOne({ key: changes.role }).lean();
    // For the Roles page's history.
    await audit(actor, "user.role_changed", {
      entityType: "user",
      entityId: id,
      summary: target.email,
      details: { from: before.role, to: changes.role },
    });
    await notify({
      type: "user.role_changed",
      recipients: [id],
      actor,
      params: { role: role.name },
      link: "/dashboard",
    });
  }
  if (changes.status === "inactive" && before.status !== "inactive") {
    await notify({ type: "user.deactivated", recipients: [id], actor });
  }
  // Someone who can no longer work (deactivated, or left without a role) still holds
  // their open tasks on the plan, and the work waiting for them is stuck: the GM / CEO
  // are told to give those tasks to someone else (nothing is moved on its own).
  const leaving = (changes.status === "inactive" && before.status !== "inactive") || (changes.role === DEFAULT_ROLE && before.role !== DEFAULT_ROLE);
  if (leaving) {
    const open = await Task.countDocuments({ assignee: id, status: { $in: ACTIVE_STATUSES } });
    if (open) {
      await notify({
        type: "user.left_with_tasks",
        recipients: await usersWithPermissionFor("projects.manage", null),
        actor,
        params: { name: after.name || target.email, n: open },
        link: "/dashboard/projects",
        entityType: "user",
        entityId: id,
      });
    }
  }

  // The user's open tabs reload their permissions and navigation.
  await publish(userChannel(id), "user:updated", { userId: id });

  if ("role" in changes || "department" in changes || "status" in changes || "managedDepartments" in changes) {
    await syncStaffChannels();
  }

  return NextResponse.json({ staff: after });
}
