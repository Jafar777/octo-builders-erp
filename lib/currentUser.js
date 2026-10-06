import { cache } from "react";
import { getSession } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { ensureErpSeeded } from "@/lib/erpSeed";
import { DEFAULT_ROLE, normalizeRoleKey } from "@/lib/permissions";
import { nameParts, pickName, viewerLang } from "@/lib/personName";
import User from "@/models/User";
import Role from "@/models/Role";

// Loads the signed-in user with their role and permissions straight from the
// database (never from the JWT), so role changes apply on the next request.
// Memoised per request with React cache().
export const getCurrentUser = cache(async () => {
  const session = await getSession();
  if (!session?.sub) return null;

  await connectDB();
  await ensureErpSeeded();

  const user = await User.findById(session.sub).lean();
  if (!user) return null;

  const roleKey = normalizeRoleKey(user.role);
  const role = await Role.findOne({ key: roleKey }).lean();
  const inactive = user.status === "inactive";

  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name || "",
    nameAr: user.nameAr || "",
    ...nameParts(user),
    // In the viewer's language, for the screens.
    displayName: pickName({ ...user, email: "" }, await viewerLang()),
    avatarUrl: user.avatarUrl || "",
    phone: user.phone || "",
    emergencyContact: {
      name: user.emergencyContact?.name || "",
      phone: user.emergencyContact?.phone || "",
      relation: user.emergencyContact?.relation || "",
    },
    role: roleKey,
    roleName: role?.name || { ar: roleKey, en: roleKey },
    permissions: inactive ? [] : role?.permissions || [],
    scope: role?.scope || "self",
    department: user.department ? user.department.toString() : null,
    branch: user.branch ? user.branch.toString() : null,
    jobTitle: user.jobTitle ? user.jobTitle.toString() : null,
    status: user.status || "active",
    isStaff: !inactive && roleKey !== DEFAULT_ROLE,
  };
});

export function hasPermission(user, permission) {
  return Boolean(user?.permissions?.includes(permission));
}

export async function requirePermission(permission) {
  const user = await getCurrentUser();
  return hasPermission(user, permission) ? user : null;
}

// Any active employee with a real role (messaging, notifications, own data).
export async function requireStaff() {
  const user = await getCurrentUser();
  return user?.isStaff ? user : null;
}

// The shape sent to client components.
export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.displayName ?? user.name,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    phone: user.phone,
    emergencyContact: user.emergencyContact,
    role: user.role,
    roleName: user.roleName,
    permissions: user.permissions,
    scope: user.scope,
    department: user.department,
    isStaff: user.isStaff,
  };
}
