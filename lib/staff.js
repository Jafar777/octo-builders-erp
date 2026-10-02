const idStr = (v) => (v ? v.toString() : null);

export function serializeStaff(u) {
  return {
    id: u._id.toString(),
    email: u.email,
    name: u.name || "",
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
