import User from "@/models/User";
import Role from "@/models/Role";
import { hasPermission } from "@/lib/currentUser";
import { effectiveAccess, isTopRole } from "@/lib/permissions";
import { loadLinks, reachesPerson } from "@/lib/reporting";
import { isObjectId } from "@/lib/apiUtils";
import { hrStaff } from "@/lib/hr";

// Changing attendance or pay: HR does it for everyone, but nobody for themselves, and
// the records of HR people (anyone whose access manages attendance or payroll) are the
// CEO's alone.
export const HR_MANAGE = ["attendance.manage", "payroll.manage"];

// The ids of the HR people.
export async function hrPeopleIds() {
  const roles = await Role.find({}, { key: 1, permissions: 1, scope: 1, limited: 1 }).lean();
  const byKey = Object.fromEntries(roles.map((r) => [r.key, r]));
  const users = await User.find({}, { role: 1, access: 1 }).lean();
  return new Set(
    users
      .filter((u) => !isTopRole(u.role) && effectiveAccess(byKey[u.role], u.access, u.role).permissions.some((p) => HR_MANAGE.includes(p)))
      .map((u) => u._id.toString())
  );
}

// Is `targetId`'s attendance / pay out of `user`'s hands? (Their own, or an HR person's,
// for anyone but the CEO.)
export async function protectedRecord(user, targetId) {
  if (isTopRole(user?.role)) return false;
  return String(targetId) === user?.id || (await hrPeopleIds()).has(String(targetId));
}

// The same for fingerprint IDs (punches are kept by badge): is any of them a protected
// person's?
export async function protectedBadges(user, badgeIds) {
  if (isTopRole(user?.role)) return false;
  const ids = [...new Set(badgeIds.filter(Boolean).map(String))];
  if (!ids.length) return false;
  const owners = await User.find({ badgeId: { $in: ids } }, { _id: 1 }).lean();
  const hr = await hrPeopleIds();
  return owners.some((o) => o._id.toString() === user.id || hr.has(o._id.toString()));
}

// Can `user` see `permission`-level data of the person `targetId`?
// Everyone can see their own attendance, payslip and KPI; changing attendance or pay
// (HR_MANAGE) follows protectedRecord.
export async function canSeePerson(user, targetId, permission) {
  if (!user?.isStaff || !isObjectId(targetId)) return false;
  if (HR_MANAGE.includes(permission) && (await protectedRecord(user, targetId))) return false;
  if (targetId === user.id) return true;
  if (!hasPermission(user, permission)) return false;
  if (user.scope === "all") return true;
  // Their department's people, or whoever the chart moved to them (lib/reporting.js).
  const target = await User.findById(targetId, { department: 1 }).lean();
  return Boolean(target) && reachesPerson(user, target, await loadLinks());
}

// Staff visible to `user` for a permission (whole list, their people, or self).
export async function staffInScope(user, permission) {
  const all = await hrStaff({ status: "active" });
  if (!hasPermission(user, permission)) return all.filter((s) => s.id === user.id);
  if (user.scope === "all") return all;
  const ctx = await loadLinks();
  return all.filter((s) => reachesPerson(user, s, ctx));
}

export const MONTH_OK = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m || "");

// A document in an employee's HR file.
export const serializeDocument = (d) => ({
  id: d._id.toString(),
  name: d.name,
  url: d.url,
  mime: d.mime,
  size: d.size,
  uploadedBy: d.uploadedBy ? d.uploadedBy.toString() : null,
  uploadedAt: d.uploadedAt,
});
