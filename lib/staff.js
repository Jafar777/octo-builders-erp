import { nameParts, pickName } from "@/lib/personName";

const idStr = (v) => (v ? v.toString() : null);

// `lang` picks the display name (see viewerLang()).
export function serializeStaff(u, lang = "ar") {
  return {
    id: u._id.toString(),
    email: u.email,
    name: pickName({ ...u, email: "" }, lang),
    ...nameParts(u),
    avatarUrl: u.avatarUrl || "",
    role: u.role === "admin" ? "gm" : u.role,
    department: idStr(u.department),
    branch: idStr(u.branch),
    jobTitle: idStr(u.jobTitle),
    status: u.status || "active",
    phone: u.phone || "",
    badgeId: u.badgeId || "",
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt || null,
  };
}

// Which accounts a user may see on the staff screens, based on their role scope.
// Department-scoped managers also see people still waiting for a role.
export function staffQueryFor(user) {
  if (user.scope === "all") return {};
  if (user.scope === "department") {
    const or = [{ department: user.department }];
    if (user.permissions.includes("users.manage")) or.push({ role: "user" });
    return { $or: or };
  }
  return { _id: user.id };
}
