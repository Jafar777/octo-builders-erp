import { cache } from "react";
import { getSession } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { ensureErpSeeded } from "@/lib/erpSeed";
import { DEFAULT_ROLE, isLimitedRole, normalizeRoleKey } from "@/lib/permissions";
import { nameParts, pickName, viewerLang } from "@/lib/personName";
import User from "@/models/User";
import Role from "@/models/Role";
import WorkProject from "@/models/WorkProject";

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
  const isStaff = !inactive && roleKey !== DEFAULT_ROLE;
  // A signed-up account with no role that a project names as its customer: they follow
  // their projects and review the tasks marked for them.
  const isCustomer = !inactive && !isStaff && Boolean(await WorkProject.exists({ customer: user._id }));

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
    // Their own department and any other they manage (lib/scope.js userDepartments).
    departments: [...new Set([user.department, ...(user.managedDepartments || [])].filter(Boolean).map(String))],
    branch: user.branch ? user.branch.toString() : null,
    jobTitle: user.jobTitle ? user.jobTitle.toString() : null,
    status: user.status || "active",
    isStaff,
    // The general manager: only messages, notifications, profile and intake forms.
    limited: isStaff && isLimitedRole(roleKey),
    isCustomer,
    trainee: !inactive && Boolean(user.trainee),
  };
});

export function hasPermission(user, permission) {
  return Boolean(user?.permissions?.includes(permission));
}

export async function requirePermission(permission) {
  const user = await getCurrentUser();
  return hasPermission(user, permission) ? user : null;
}

// Any active employee with a real role. The limited roles (the general manager) are
// refused unless the route passes { limited: true }: messages, profile, intake forms.
export async function requireStaff({ limited = false } = {}) {
  const user = await getCurrentUser();
  if (!user?.isStaff) return null;
  return user.limited && !limited ? null : user;
}

// An employee with the full dashboard (not a limited role).
export const isEmployee = (user) => Boolean(user?.isStaff && !user.limited);

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
    departments: user.departments,
    isStaff: user.isStaff,
    limited: user.limited,
    isCustomer: user.isCustomer,
    trainee: user.trainee,
  };
}
