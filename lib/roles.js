import { bilingual } from "@/lib/apiUtils";
import { isTopRole, PAGE_KEYS, PERMISSION_KEYS, RESTRICTED_PERMISSIONS, SCOPES, workDepartments } from "@/lib/permissions";
import Role from "@/models/Role";
import User from "@/models/User";

export function serializeRole(r, userCount = 0) {
  return {
    key: r.key,
    name: r.name,
    description: r.description || { ar: "", en: "" },
    permissions: r.permissions || [],
    scope: r.scope,
    limited: Boolean(r.limited),
    pages: r.pages || [],
    crossDepartment: Boolean(r.crossDepartment),
    requireMfa: Boolean(r.requireMfa),
    system: Boolean(r.system),
    top: isTopRole(r.key),
    userCount,
    updatedAt: r.updatedAt || null,
  };
}

const keep = (list, allowed) => [...new Set((Array.isArray(list) ? list : []).filter((p) => allowed.includes(p)))];

export function cleanRoleBody(body) {
  return {
    name: bilingual(body.name, 80),
    description: bilingual(body.description, 300),
    permissions: keep(body.permissions, PERMISSION_KEYS),
    scope: SCOPES.includes(body.scope) ? body.scope : "self",
    limited: Boolean(body.limited),
    pages: keep(body.pages, PAGE_KEYS),
    crossDepartment: Boolean(body.crossDepartment),
    requireMfa: Boolean(body.requireMfa),
  };
}

// A restricted role keeps only the permissions it can use.
export function trimRestricted(data) {
  if (data.limited) data.permissions = data.permissions.filter((p) => RESTRICTED_PERMISSIONS.includes(p));
  return data;
}

// One person's exceptions to their role (User.access).
export function cleanAccessBody(body) {
  const grant = keep(body.grant, PERMISSION_KEYS);
  return {
    grant,
    deny: keep(body.deny, PERMISSION_KEYS).filter((p) => !grant.includes(p)),
    scope: SCOPES.includes(body.scope) ? body.scope : null,
    hiddenPages: keep(body.hiddenPages, PAGE_KEYS),
    workDepartments: [...new Set((Array.isArray(body.workDepartments) ? body.workDepartments : []).map(String).filter((d) => /^[a-f0-9]{24}$/i.test(d)))],
    crossDepartment: typeof body.crossDepartment === "boolean" ? body.crossDepartment : null,
    note: String(body.note || "").trim().slice(0, 500),
  };
}

// People with the departments they can be given work from (`work`), for assignment
// checks and pickers. Each needs role, department, managedDepartments and access.
export async function withWorkDepartments(people) {
  const keys = [...new Set(people.map((p) => p.role))];
  const roles = Object.fromEntries((await Role.find({ key: { $in: keys } }, { key: 1, crossDepartment: 1 }).lean()).map((r) => [r.key, r]));
  return people.map((p) => ({ ...p, work: workDepartments(roles[p.role], p) }));
}

// Nobody below the CEO hands out more than they have themselves: permissions the
// actor lacks can't be added (removing is fine), nor a wider scope than theirs.
const SCOPE_RANK = { self: 0, department: 1, all: 2 };
export function escalation(actor, beforePermissions, afterPermissions, scope) {
  if (isTopRole(actor.role)) return null;
  const added = afterPermissions.filter((p) => !beforePermissions.includes(p));
  if (added.some((p) => !actor.permissions.includes(p))) return "cannot_grant_more";
  if (scope && SCOPE_RANK[scope] > SCOPE_RANK[actor.scope]) return "cannot_grant_more";
  return null;
}

// All roles with how many accounts hold each one.
export async function loadRolesWithCounts() {
  const [roles, counts] = await Promise.all([
    Role.find().sort({ createdAt: 1 }).lean(),
    User.aggregate([{ $group: { _id: "$role", n: { $sum: 1 } } }]),
  ]);
  const byRole = Object.fromEntries(counts.map((c) => [c._id === "admin" ? "ceo" : c._id, c.n]));
  return roles.map((r) => serializeRole(r, byRole[r.key] || 0));
}
