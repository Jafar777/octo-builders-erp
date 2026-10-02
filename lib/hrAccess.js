import User from "@/models/User";
import { hasPermission } from "@/lib/currentUser";
import { inScope } from "@/lib/scope";
import { isObjectId } from "@/lib/apiUtils";
import { hrStaff } from "@/lib/hr";

// Can `user` see `permission`-level data of the person `targetId`?
// Everyone can see their own attendance, payslip and KPI.
export async function canSeePerson(user, targetId, permission) {
  if (!user?.isStaff || !isObjectId(targetId)) return false;
  if (targetId === user.id) return true;
  if (!hasPermission(user, permission)) return false;
  if (user.scope === "all") return true;
  const target = await User.findById(targetId, { department: 1 }).lean();
  return Boolean(target) && inScope(user, target.department);
}

// Staff visible to `user` for a permission (whole list, own department, or self).
export async function staffInScope(user, permission) {
  const all = await hrStaff({ status: "active" });
  if (!hasPermission(user, permission)) return all.filter((s) => s.id === user.id);
  if (user.scope === "all") return all;
  return all.filter((s) => s.department && s.department === user.department);
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
