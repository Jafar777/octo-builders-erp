import Role from "@/models/Role";
import User from "@/models/User";

const idStr = (v) => (v ? v.toString() : null);

// Is `departmentId` inside the user's role scope?
export function inScope(user, departmentId) {
  if (!user) return false;
  if (user.scope === "all") return true;
  return user.scope === "department" && Boolean(user.department) && user.department === idStr(departmentId);
}

// Active users holding `permission` whose scope covers `departmentId`.
export async function usersWithPermissionFor(permission, departmentId) {
  const roles = await Role.find({ permissions: permission }, { key: 1, scope: 1 }).lean();
  const all = roles.filter((r) => r.scope === "all").map((r) => r.key);
  const dept = roles.filter((r) => r.scope === "department").map((r) => r.key);
  const or = [];
  if (all.length) or.push({ role: { $in: all } });
  if (dept.length && departmentId) or.push({ role: { $in: dept }, department: departmentId });
  if (!or.length) return [];
  const users = await User.find({ status: "active", $or: or }, { _id: 1 }).lean();
  return users.map((u) => u._id.toString());
}
