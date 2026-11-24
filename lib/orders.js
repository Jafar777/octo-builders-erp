// The Requests page (الطلبات): leave, overtime and purchase requests in one place. How
// many wait for this person's own answer, and which kinds they answer at all. The rules
// themselves stay with each kind (lib/leave.js, lib/overtime.js, lib/purchasing.js).
import { hasPermission } from "@/lib/currentUser";
import { isFinalApprover, serializeLeaves, managerLeaveFilter } from "@/lib/leave";
import { isDeptManager } from "@/lib/managerKpi";
import { canDecideAny, canDecideOvertime, isOvertimeAdmin, managerOvertimeFilter } from "@/lib/overtime";
import { canDecidePurchase } from "@/lib/purchasing";
import LeaveRequest from "@/models/LeaveRequest";
import OvertimeRequest from "@/models/OvertimeRequest";
import { workQueue } from "@/lib/hybridServer";
import { isTopRole } from "@/lib/permissions";
import PurchaseRequest from "@/models/PurchaseRequest";

export function ordersDecides(user) {
  return {
    leave: isFinalApprover(user) || isDeptManager(user),
    overtime: canDecideAny(user),
    purchase: hasPermission(user, "purchasing.approve") && !user.limited,
    work: isTopRole(user.role) || isDeptManager(user),
  };
}

export async function ordersWaiting(user) {
  const decides = ordersDecides(user);
  const [leave, overtime, purchase, work] = await Promise.all([
    decides.leave
      ? LeaveRequest.find({ status: "pending", user: { $ne: user.id }, ...(isFinalApprover(user) ? {} : managerLeaveFilter(user)) })
          .lean()
          .then((list) => serializeLeaves(list, user))
          // (Settling one still with its manager is possible for HR / CEO, but it isn't waiting for them.)
          .then((list) => list.filter((l) => l.canDecide && !l.overrule).length)
      : 0,
    decides.overtime
      ? OvertimeRequest.find({ status: "pending", user: { $ne: user.id }, ...(isOvertimeAdmin(user) ? {} : managerOvertimeFilter(user)) })
          .lean()
          .then((list) => list.filter((r) => canDecideOvertime(user, r)).length)
      : 0,
    decides.purchase
      ? PurchaseRequest.find({ status: "pending" }, { requestedBy: 1, department: 1 })
          .lean()
          .then((list) => list.filter((r) => canDecidePurchase(user, r)).length)
      : 0,
    decides.work ? workQueue(user).then((list) => list.length) : 0,
  ]);
  return { decides, counts: { leave, overtime, purchase, work } };
}
