import { bilingual } from "@/lib/apiUtils";
import { PERMISSION_KEYS, SCOPES } from "@/lib/permissions";
import Role from "@/models/Role";
import User from "@/models/User";

export function serializeRole(r, userCount = 0) {
  return {
    key: r.key,
    name: r.name,
    permissions: r.permissions,
    scope: r.scope,
    system: r.system,
    userCount,
  };
}

export function cleanRoleBody(body) {
  return {
    name: bilingual(body.name, 80),
    permissions: (Array.isArray(body.permissions) ? body.permissions : []).filter((p) =>
      PERMISSION_KEYS.includes(p)
    ),
    scope: SCOPES.includes(body.scope) ? body.scope : "self",
  };
}

// All roles with how many accounts hold each one.
export async function loadRolesWithCounts() {
  const [roles, counts] = await Promise.all([
    Role.find().sort({ createdAt: 1 }).lean(),
    User.aggregate([{ $group: { _id: "$role", n: { $sum: 1 } } }]),
  ]);
  const byRole = Object.fromEntries(counts.map((c) => [c._id === "admin" ? "gm" : c._id, c.n]));
  return roles.map((r) => serializeRole(r, byRole[r.key] || 0));
}
