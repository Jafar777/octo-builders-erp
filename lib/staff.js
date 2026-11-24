import { nameParts, pickName } from "@/lib/personName";
import { CODER_ROLE, HIDDEN_ROLES } from "@/lib/permissions";
import { reachedIds } from "@/lib/reporting";

const idStr = (v) => (v ? v.toString() : null);

// `lang` picks the display name (see viewerLang()).
export function serializeStaff(u, lang = "ar") {
  return {
    id: u._id.toString(),
    email: u.email,
    name: pickName({ ...u, email: "" }, lang),
    ...nameParts(u),
    avatarUrl: u.avatarUrl || "",
    role: u.role === "admin" ? "ceo" : u.role,
    department: idStr(u.department),
    // Other departments this manager heads too.
    managedDepartments: (u.managedDepartments || []).map(idStr).filter((d) => d !== idStr(u.department)),
    branch: idStr(u.branch),
    jobTitle: idStr(u.jobTitle),
    status: u.status || "active",
    phone: u.phone || "",
    badgeId: u.badgeId || "",
    trainee: Boolean(u.trainee),
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt || null,
  };
}

// Which accounts a user may see on the staff screens, based on their role scope.
// Department-scoped managers also see people still waiting for a role.
export async function staffQueryFor(user) {
  // The hidden coder accounts are only listed for a coder.
  if (user.role === CODER_ROLE) return {};
  return { $and: [await staffQueryForScope(user), { role: { $nin: HIDDEN_ROLES } }] };
}

async function staffQueryForScope(user) {
  if (user.scope === "all") return {};
  if (user.scope === "department") {
    // Their team: their departments' people (minus anyone the chart moved to another
    // manager) and the people the chart moved to them (lib/reporting.js) — not
    // themselves (their own record is on their profile page).
    const or = [{ _id: { $in: (await reachedIds(user)).filter((id) => id !== user.id) } }];
    if (user.permissions.includes("users.manage")) or.push({ role: "user" });
    return { $or: or };
  }
  return { _id: user.id };
}
