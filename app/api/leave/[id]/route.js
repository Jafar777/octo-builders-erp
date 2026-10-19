import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { hrMonthState } from "@/lib/hr";
import { canDecideLeave, finalApprovers, leaveStage } from "@/lib/leave";
import { notify } from "@/lib/notify";
import LeaveRequest from "@/models/LeaveRequest";
import User from "@/models/User";
import { pickName } from "@/lib/personName";

// Body: { decision: "approve" | "reject" | "cancel", note }
//   approve / reject: whoever decides the current step (lib/leave.js).
//   cancel: the employee, while pending.
export async function PATCH(request, { params }) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const { id } = await params;
  const leave = isObjectId(id) ? await LeaveRequest.findById(id).lean() : null;
  if (!leave) return notFound();
  const { decision, note } = await readJson(request);

  if (decision === "cancel") {
    if (leave.user.toString() !== user.id || leave.status !== "pending") return forbidden();
    await LeaveRequest.updateOne({ _id: leave._id, status: "pending" }, { $set: { status: "cancelled" } });
    return NextResponse.json({ ok: true });
  }

  if (!["approve", "reject"].includes(decision)) return fail("invalid_request");
  if (leave.user.toString() === user.id) return fail("cannot_approve_own", 403);
  if (leave.status !== "pending") return fail("already_decided", 409);
  if (!canDecideLeave(user, leave)) return forbidden();
  if ((await hrMonthState(leave.from.slice(0, 7))).closed) return fail("month_closed", 409);

  const stage = leaveStage(leave);
  const now = new Date();
  const text = String(note || "").slice(0, 500);
  // The manager passing it on to HR / GM; anything else is the final answer.
  const forward = stage === "manager" && decision === "approve";
  const set = forward
    ? { stage: "final", managerDecision: { by: user.id, at: now, note: text } }
    : {
        status: decision === "approve" ? "approved" : "rejected",
        decidedBy: user.id,
        decidedAt: now,
        decisionNote: text,
        ...(stage === "manager" ? { managerDecision: { by: user.id, at: now, note: text } } : {}),
      };
  // Only one decision per step, even if two approvers click at the same moment.
  const match = { _id: leave._id, status: "pending", ...(stage === "final" ? { stage: { $ne: "manager" } } : { stage: "manager" }) };
  const updated = await LeaveRequest.findOneAndUpdate(match, { $set: set }, { new: true }).lean();
  if (!updated) return fail("already_decided", 409);

  const owner = leave.user.toString();
  const params_ = { from: leave.from, to: leave.to };
  if (forward) {
    await audit(user, "leave.manager_approved", { entityType: "leave", entityId: leave._id, summary: `${leave.from} → ${leave.to}` });
    const employee = await User.findById(owner, { name: 1, nameAr: 1, email: 1 }).lean();
    await notify({
      type: "leave.awaiting_final",
      recipients: await finalApprovers(owner),
      actor: user,
      params: { actor: user.name || user.email, employee: pickName(employee, "en"), employeeAr: pickName(employee, "ar"), days: leave.days, ...params_ },
      link: "/dashboard/hr?tab=leave",
      entityType: "leave",
      entityId: leave._id,
    });
    await notify({
      type: "leave.manager_approved",
      recipients: [owner],
      actor: user,
      params: params_,
      link: "/dashboard/attendance",
      entityType: "leave",
      entityId: leave._id,
    });
    return NextResponse.json({ ok: true });
  }

  await audit(user, `leave.${updated.status}`, { entityType: "leave", entityId: leave._id, summary: `${leave.from} → ${leave.to}` });
  await notify({
    type: updated.status === "approved" ? "leave.approved" : "leave.rejected",
    recipients: [owner],
    actor: user,
    params: params_,
    link: "/dashboard/attendance",
    entityType: "leave",
    entityId: leave._id,
  });
  return NextResponse.json({ ok: true });
}
