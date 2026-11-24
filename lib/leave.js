import User from "@/models/User";
import LeaveRequest from "@/models/LeaveRequest";
import { hrPeopleIds } from "@/lib/hrAccess";
import Role from "@/models/Role";
import { hasPermission } from "@/lib/currentUser";
import { isDeptManager, managerRoleKeys } from "@/lib/managerKpi";
import { NAME_FIELDS, pickName, viewerLang } from "@/lib/personName";
import { HIDDEN_ROLES, isTopRole } from "@/lib/permissions";
import { headsOf, userDepartments } from "@/lib/scope";

// Leave approval, two steps:
//   1. "manager": a manager of the employee's department. Rejecting ends it there.
//   2. "final":   HR or the GM / CEO, all at once — the first one to decide settles it.
// Employees with no department manager above them (heads, or departments without
// one) go straight to step 2.

const idStr = (v) => (v ? v.toString() : null);
export const leaveStage = (l) => l.stage || "final";

// HR / GM / CEO: company-wide roles allowed to approve leave.
export const isFinalApprover = (user) => hasPermission(user, "leave.approve") && user?.scope === "all";
export const isLeaveManagerOf = (user, departmentId) => isDeptManager(user) && Boolean(departmentId) && userDepartments(user).includes(departmentId);

// The manager step's own deciders: the managers named when it was asked (older
// requests: the department's).
export function isStageManager(user, leave) {
  if (leave.routed) return isDeptManager(user) && (leave.managers || []).map(idStr).includes(user.id);
  return isLeaveManagerOf(user, idStr(leave.department));
}

// HR / GM / CEO may also settle a request still waiting for the manager (one who is away
// or doesn't answer): their decision is the final one.
// `hrIds` (lib/hrAccess.js hrPeopleIds): an HR person's leave is the CEO's to settle,
// not a colleague's in HR.
export function canDecideLeave(user, leave, hrIds = null) {
  if (!user || leave.status !== "pending" || idStr(leave.user) === user.id) return false;
  const final = isFinalApprover(user) && (!hrIds?.has(idStr(leave.user)) || isTopRole(user.role));
  if (leaveStage(leave) !== "manager") return final;
  return isStageManager(user, leave) || final;
}

// Mongo filter: leave requests `user` decides (or decided) at the manager step — named on
// the request, or older requests (no names) of their departments.
export const managerLeaveFilter = (user) => ({
  $or: [{ managers: user.id }, { routed: { $ne: true }, department: { $in: userDepartments(user) } }],
});

// Active managers of a department, other than `exceptId`.
export async function departmentManagers(departmentId, exceptId) {
  if (!departmentId) return [];
  const users = await User.find({ role: { $in: await managerRoleKeys() }, ...(await headsOf(departmentId)), status: "active" }, { _id: 1 }).lean();
  return users.map((u) => u._id.toString()).filter((id) => id !== exceptId);
}

// HR / GM / CEO accounts, other than `exceptId`.
// `exceptId` is the employee: when they're an HR person, only the CEO decides.
export async function finalApprovers(exceptId) {
  if (exceptId && (await hrPeopleIds()).has(String(exceptId))) {
    return (await User.find({ role: "ceo", status: "active" }, { _id: 1 }).lean()).map((u) => u._id.toString()).filter((id) => id !== exceptId);
  }
  const roles = await Role.find({ permissions: "leave.approve", scope: "all", key: { $nin: HIDDEN_ROLES } }, { key: 1 }).lean();
  const users = await User.find({ role: { $in: roles.map((r) => r.key) }, status: "active" }, { _id: 1 }).lean();
  return users.map((u) => u._id.toString()).filter((id) => id !== exceptId);
}

// Annual leave left for `userId` in `year`: their allowance (HR file, 21 by default)
// minus approved annual leave starting that year, and — `withPending` — the requests
// still waiting (so two requests can't both use the same days). `exceptId` = the request
// being decided, left out.
export async function annualLeft(userId, year, { withPending = true, exceptId = null } = {}) {
  const person = await User.findById(userId, { annualLeaveDays: 1 }).lean();
  const total = person?.annualLeaveDays ?? 21;
  const taken = await LeaveRequest.find({
    user: userId,
    type: "annual",
    status: { $in: withPending ? ["approved", "pending"] : ["approved"] },
    from: { $gte: `${year}-01-01`, $lte: `${year}-12-31` },
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  }, { days: 1 }).lean();
  return total - taken.reduce((a, l) => a + (l.days || 0), 0);
}

// `viewer` adds canDecide (show approve / reject to them).
export async function serializeLeaves(list, viewer = null) {
  const hrIds = viewer ? await hrPeopleIds() : null;
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
    canDecide: canDecideLeave(viewer, l, hrIds),
    // The CEO may call off approved leave.
    canRevoke: Boolean(viewer && isTopRole(viewer.role) && l.status === "approved" && idStr(l.user) !== viewer.id),
    revoked: l.revokedAt ? { at: l.revokedAt, note: l.revokeNote || "" } : null,
    // HR / GM / CEO deciding before the manager did: their answer is the final one.
    overrule: Boolean(viewer) && leaveStage(l) === "manager" && canDecideLeave(viewer, l, hrIds) && !isStageManager(viewer, l),
  }));
}
