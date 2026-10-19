import User from "@/models/User";
import Role from "@/models/Role";
import { hasPermission } from "@/lib/currentUser";
import { isDeptManager, managerRoleKeys } from "@/lib/managerKpi";
import { NAME_FIELDS, pickName, viewerLang } from "@/lib/personName";

// Leave approval, two steps:
//   1. "manager": a manager of the employee's department. Rejecting ends it there.
//   2. "final":   HR or the GM / CEO, all at once — the first one to decide settles it.
// Employees with no department manager above them (heads, or departments without
// one) go straight to step 2.

const idStr = (v) => (v ? v.toString() : null);
export const leaveStage = (l) => l.stage || "final";

// HR / GM / CEO: company-wide roles allowed to approve leave.
export const isFinalApprover = (user) => hasPermission(user, "leave.approve") && user?.scope === "all";
export const isLeaveManagerOf = (user, departmentId) => isDeptManager(user) && Boolean(departmentId) && user.department === departmentId;

export function canDecideLeave(user, leave) {
  if (!user || leave.status !== "pending" || idStr(leave.user) === user.id) return false;
  return leaveStage(leave) === "manager" ? isLeaveManagerOf(user, idStr(leave.department)) : isFinalApprover(user);
}

// Active managers of a department, other than `exceptId`.
export async function departmentManagers(departmentId, exceptId) {
  if (!departmentId) return [];
  const users = await User.find({ role: { $in: await managerRoleKeys() }, department: departmentId, status: "active" }, { _id: 1 }).lean();
  return users.map((u) => u._id.toString()).filter((id) => id !== exceptId);
}

// HR / GM / CEO accounts, other than `exceptId`.
export async function finalApprovers(exceptId) {
  const roles = await Role.find({ permissions: "leave.approve", scope: "all" }, { key: 1 }).lean();
  const users = await User.find({ role: { $in: roles.map((r) => r.key) }, status: "active" }, { _id: 1 }).lean();
  return users.map((u) => u._id.toString()).filter((id) => id !== exceptId);
}

// `viewer` adds canDecide (show approve / reject to them).
export async function serializeLeaves(list, viewer = null) {
  const ids = [...new Set(list.flatMap((l) => [idStr(l.user), idStr(l.decidedBy), idStr(l.managerDecision?.by)]).filter(Boolean))];
  const users = await User.find({ _id: { $in: ids } }, NAME_FIELDS).lean();
  const lang = await viewerLang();
  const names = Object.fromEntries(users.map((u) => [u._id.toString(), pickName(u, lang)]));
  return list.map((l) => ({
    id: l._id.toString(),
    userId: l.user.toString(),
    userName: names[l.user.toString()] || "—",
    type: l.type,
    from: l.from,
    to: l.to,
    days: l.days,
    reason: l.reason,
    attachmentUrl: l.attachmentUrl,
    status: l.status,
    stage: leaveStage(l),
    department: idStr(l.department),
    manager: l.managerDecision?.by
      ? { name: names[idStr(l.managerDecision.by)] || "—", at: l.managerDecision.at, note: l.managerDecision.note || "" }
      : null,
    decidedBy: names[idStr(l.decidedBy)] || null,
    decidedAt: l.decidedAt,
    decisionNote: l.decisionNote,
    createdAt: l.createdAt,
    canDecide: canDecideLeave(viewer, l),
  }));
}
