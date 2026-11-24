import { cache } from "react";
import { headers } from "next/headers";
import { audit } from "@/lib/audit";
import { getSession, getViewAs } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { ensureErpSeeded } from "@/lib/erpSeed";
import { DEFAULT_ROLE, effectiveAccess, normalizeRoleKey } from "@/lib/permissions";
import { nameParts, pickName, viewerLang } from "@/lib/personName";
import User from "@/models/User";
import Role from "@/models/Role";
import WorkProject from "@/models/WorkProject";
import { activeMerges, expiredMergeDepartments, stillHeaded } from "@/lib/mergeState";

// Loads the signed-in user with their role and permissions straight from the
// database (never from the JWT), so role changes apply on the next request.
// Memoised per request with React cache().
export const getCurrentUser = cache(async () => {
  const real = await getSessionUser();
  if (!real) return null;
  // "View as…": the CEO sees the dashboard as another person and acts for them.
  const viewAs = canViewAs(real) ? await getViewAs(real.id) : null;
  if (!viewAs) return real;
  const target = await User.findById(viewAs).lean();
  if (!target || !canBeViewedAs(target, real)) return real;
  const person = await loadUser(target);
  // (`role`: the real person's, e.g. the CEO's change requests while viewing as someone.)
  const acting = { ...person, actingAs: { id: real.id, name: real.displayName || real.name || real.email, role: real.role } };
  // A change (not just looking): logged under the CEO, for this person (set by proxy.js).
  const write = (await headers()).get("x-octa-view-as-write");
  if (write) await audit(acting, "view_as.change", { entityType: "user", entityId: acting.id, summary: write.slice(0, 200) });
  return acting;
});

// Who signed in, ignoring "View as…".
export const getSessionUser = cache(async () => {
  const session = await getSession();
  if (!session?.sub) return null;

  await connectDB();
  await ensureErpSeeded();
  // (Merges past their end date are ended by the daily jobs and the Organization page;
  // until then loadUser leaves their departments out — lib/mergeState.js.)

  const user = await User.findById(session.sub).lean();
  if (!user) return null;
  return loadUser(user);
});

// The CEO and the programmer (coder) use "View as…". The CEO never views as a coder or
// another CEO; a coder (who already has everything) may view as anyone else.
export const VIEW_AS_ROLE = "ceo";
export const VIEW_AS_ROLES = [VIEW_AS_ROLE, "coder"];
export function canViewAs(real) {
  // (Never a deactivated account: its own permissions are gone, so are others'.)
  return real?.status !== "inactive" && VIEW_AS_ROLES.includes(normalizeRoleKey(real?.role));
}
export function canBeViewedAs(target, real) {
  const role = normalizeRoleKey(target.role);
  if (String(target._id) === String(real.id) || target.status === "inactive") return false;
  if (normalizeRoleKey(real.role) === "coder") return true;
  return !["coder", VIEW_AS_ROLE].includes(role);
}

async function loadUser(user) {

  const roleKey = normalizeRoleKey(user.role);
  const role = await Role.findOne({ key: roleKey }).lean();
  const inactive = user.status === "inactive";
  const isStaff = !inactive && roleKey !== DEFAULT_ROLE;
  // The role, with this person's own exceptions (the CEO sets both on the Roles page).
  const access = effectiveAccess(role, user.access, roleKey);
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
    permissions: inactive ? [] : access.permissions,
    scope: access.scope,
    // Only these pages (null = every page their permissions open).
    pages: access.pages,
    department: user.department ? user.department.toString() : null,
    // Their own department and any other they manage (lib/scope.js userDepartments),
    // minus those merged under another manager for now (lib/mergeState.js).
    departments: await (async () => {
      const id = user._id.toString();
      const expired = await expiredMergeDepartments(id);
      const own = [...new Set([user.department, ...(user.managedDepartments || [])].filter(Boolean).map(String))].filter((d) => !expired.has(d) || d === String(user.department));
      return stillHeaded(await activeMerges(), id, own);
    })(),
    branch: user.branch ? user.branch.toString() : null,
    jobTitle: user.jobTitle ? user.jobTitle.toString() : null,
    status: user.status || "active",
    isStaff,
    // The general manager: only messages, notifications, profile and intake forms.
    limited: isStaff && access.limited,
    isCustomer,
    trainee: !inactive && Boolean(user.trainee),
    // Authenticator app: on for this account, and whether their role demands it (the
    // dashboard then asks them to set it up before anything else).
    mfaEnabled: Boolean(user.mfa?.enabled),
    mfaRequired: isStaff && Boolean(role?.requireMfa),
    // Their own screen set-up (theme, pinned pages, folded groups, first-day guide).
    ui: {
      theme: user.ui?.theme === "light" ? "light" : "dark",
      favorites: user.ui?.favorites || [],
      collapsed: user.ui?.collapsed || [],
      welcomed: Boolean(user.ui?.welcomedAt),
      // Their own look (Appearance page, lib/appearance.js); null = the company default.
      appearance: user.ui?.appearance || null,
    },
    // The CEO locked this person's own photo and details (only management changes them).
    profileLocked: Boolean(user.profileLocked),
    actingAs: null,
  };
}

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
    pages: user.pages,
    department: user.department,
    departments: user.departments,
    isStaff: user.isStaff,
    limited: user.limited,
    isCustomer: user.isCustomer,
    trainee: user.trainee,
    mfaEnabled: user.mfaEnabled,
    mfaRequired: user.mfaRequired,
    ui: user.ui,
    profileLocked: user.profileLocked,
    // Set while the CEO views the dashboard as this person: { id, name } of the CEO.
    actingAs: user.actingAs || null,
  };
}
