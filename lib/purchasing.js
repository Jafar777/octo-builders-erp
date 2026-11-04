import { hasPermission } from "@/lib/currentUser";
import { userDepartments } from "@/lib/scope";

const idStr = (v) => (v ? v.toString() : null);

// Who decides a purchase: purchasing.approve with company scope decides everyone's;
// with department scope, their departments'. Never their own request.
export function canDecidePurchase(user, request) {
  if (!user?.isStaff || user.limited || !hasPermission(user, "purchasing.approve")) return false;
  if (request && idStr(request.requestedBy) === user.id) return false;
  if (user.scope === "all") return true;
  return Boolean(request?.department && userDepartments(user).includes(idStr(request.department)));
}

// The requests a user may see: everyone's (company approvers, asset managers), their
// departments' (department approvers), or their own.
export function purchaseScope(user) {
  if (hasPermission(user, "purchasing.approve") && user.scope === "all") return {};
  if (hasPermission(user, "assets.manage")) return {};
  if (hasPermission(user, "purchasing.approve") && user.scope === "department") return { $or: [{ department: { $in: userDepartments(user) } }, { requestedBy: user.id }] };
  return { requestedBy: user.id };
}

export function serializePurchase(r, { names = {}, money = true, user } = {}) {
  return {
    id: idStr(r._id),
    number: r.number,
    title: r.title,
    description: r.description,
    items: money ? r.items || [] : (r.items || []).map((x) => ({ description: x.description, qty: x.qty })),
    total: money ? r.total : null,
    currency: r.currency,
    supplier: idStr(r.supplier),
    supplierName: names.suppliers?.[idStr(r.supplier)] || "",
    department: idStr(r.department),
    branch: idStr(r.branch),
    project: idStr(r.project),
    task: idStr(r.task),
    taskNumber: names.tasks?.[idStr(r.task)] || null,
    neededBy: r.neededBy,
    status: r.status,
    requestedBy: idStr(r.requestedBy),
    requestedByName: names.people?.[idStr(r.requestedBy)] || "",
    decidedByName: names.people?.[idStr(r.decidedBy)] || "",
    decidedAt: r.decidedAt,
    decisionNote: r.decisionNote,
    receivedAt: r.receivedAt,
    expense: idStr(r.expense),
    asset: idStr(r.asset),
    createdAt: r.createdAt,
    canDecide: user ? canDecidePurchase(user, r) : false,
  };
}
