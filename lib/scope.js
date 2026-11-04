import Role from "@/models/Role";
import User from "@/models/User";
import { DEFAULT_ROLE, HIDDEN_ROLES } from "@/lib/permissions";

const idStr = (v) => (v ? v.toString() : null);

// The departments a user belongs to or manages: their own, plus any other they head
// (User.managedDepartments). A department manager's scope covers all of them.
export function userDepartments(user) {
  if (Array.isArray(user?.departments) && user.departments.length) return user.departments;
  return user?.department ? [user.department] : [];
}

// Mongo filter on `field` for the user's departments.
export const inDepartments = (user, field = "department") => ({ [field]: { $in: userDepartments(user) } });

// The people who are in a department or manage it: { $or } for User queries.
export const memberOrManagerOf = (departmentId) => ({ $or: [{ department: departmentId }, { managedDepartments: departmentId }] });

// Roles whose holders aren't part of the organization: no role, the restricted roles
// (the GM by default — the CEO sets it on the Roles page) and the hidden coder.
export async function outsideRoleKeys() {
  const restricted = (await Role.find({ limited: true }, { key: 1 }).lean()).map((r) => r.key);
  return [DEFAULT_ROLE, ...restricted, ...HIDDEN_ROLES];
}

// Is `departmentId` inside the user's role scope?
export function inScope(user, departmentId) {
  if (!user) return false;
  if (user.scope === "all") return true;
  return user.scope === "department" && Boolean(departmentId) && userDepartments(user).includes(idStr(departmentId));
}

// Active users holding `permission` whose scope covers `departmentId`.
export async function usersWithPermissionFor(permission, departmentId) {
  // Not the hidden coder role: it gets no automatic notifications.
  const roles = await Role.find({ permissions: permission, key: { $nin: HIDDEN_ROLES } }, { key: 1, scope: 1 }).lean();
  const all = roles.filter((r) => r.scope === "all").map((r) => r.key);
  const dept = roles.filter((r) => r.scope === "department").map((r) => r.key);
  const or = [];
  if (all.length) or.push({ role: { $in: all } });
  // Department-scoped roles: in that department, or managing it as well.
  if (dept.length && departmentId) or.push({ role: { $in: dept }, ...memberOrManagerOf(departmentId) });
  if (!or.length) return [];
  const users = await User.find({ status: "active", $or: or }, { _id: 1 }).lean();
  return users.map((u) => u._id.toString());
}
