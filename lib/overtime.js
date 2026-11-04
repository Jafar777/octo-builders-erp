// Overtime requests. Overtime only counts (and is paid) on a day the employee asked for
// it — on the day itself, never in advance — and their department manager or the CEO
// approved it, up to the approved hours (lib/attendance.js computeAttendance). A
// rejected or still pending request counts nothing.

import { hasPermission } from "@/lib/currentUser";
import { isTopRole } from "@/lib/permissions";
import { pickName } from "@/lib/personName";
import { inDepartments, userDepartments } from "@/lib/scope";

const idStr = (v) => (v ? v.toString() : null);

// overtime.approve (set on the Roles page): company-wide scope decides every request,
// department scope (department managers) their departments' requests.
const approves = (user) => Boolean(user?.isStaff && !user.limited && hasPermission(user, "overtime.approve"));
export const isOvertimeAdmin = (user) => approves(user) && user.scope === "all";
export const isOvertimeManager = (user) => approves(user) && user.scope === "department" && userDepartments(user).length > 0;
export const canDecideAny = (user) => isOvertimeAdmin(user) || isOvertimeManager(user);

// May `user` approve / reject `request`? Never their own.
export function canDecideOvertime(user, request) {
  if (!user || request.status !== "pending" || idStr(request.user) === user.id) return false;
  if (isOvertimeAdmin(user)) return true;
  return isOvertimeManager(user) && userDepartments(user).includes(idStr(request.department));
}

// Who may ask: employees with the full dashboard (not the GM / CEO, who have no
// attendance requirement).
export const canAskOvertime = (user) => Boolean(user?.isStaff && !user.limited && !isTopRole(user.role));

// The requests a user may see: everyone's (CEO), their department's (its manager), or their own.
export function overtimeScope(user) {
  if (isOvertimeAdmin(user)) return {};
  if (isOvertimeManager(user)) return { $or: [inDepartments(user), { user: user.id }] };
  return { user: user.id };
}

export function serializeOvertime(r, people, lang, viewer) {
  const name = (id) => (people[idStr(id)] ? pickName(people[idStr(id)], lang) : null);
  return {
    id: idStr(r._id),
    user: { id: idStr(r.user), name: name(r.user), avatarUrl: people[idStr(r.user)]?.avatarUrl || "" },
    date: r.date,
    hours: r.hours,
    reason: r.reason || "",
    status: r.status,
    approvedHours: r.approvedHours || 0,
    decidedBy: name(r.decidedBy),
    decidedAt: r.decidedAt || null,
    decisionNote: r.decisionNote || "",
    createdAt: r.createdAt,
    canDecide: canDecideOvertime(viewer, r),
  };
}
