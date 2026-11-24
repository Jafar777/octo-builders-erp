import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { hrMonthState } from "@/lib/hr";
import { annualLeft, canDecideLeave, finalApprovers, isStageManager, leaveStage } from "@/lib/leave";
import { cascadeFrom, clearOverlaps, getWorkCalendar } from "@/lib/ganttServer";
import { notify } from "@/lib/notify";
import { trackDelays } from "@/lib/projectDelay";
import LeaveRequest from "@/models/LeaveRequest";
import User from "@/models/User";
import { pickName } from "@/lib/personName";
import { hrPeopleIds } from "@/lib/hrAccess";
import { isTopRole } from "@/lib/permissions";

// Body: { decision: "approve" | "reject" | "cancel" | "revoke", note }
//   approve / reject: whoever decides the current step (lib/leave.js).
//   cancel: the employee, while pending.
//   revoke: the CEO, on approved leave.
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

  // The CEO alone calls off leave that was already approved (the days count as normal
  // working days again). Not in a closed payroll month.
  if (decision === "revoke") {
    if (!isTopRole(user.role)) return forbidden();
    if (leave.status !== "approved") return fail("leave_not_approved", 409);
    for (const m of new Set([leave.from.slice(0, 7), leave.to.slice(0, 7)])) {
      if ((await hrMonthState(m)).closed) return fail("month_closed", 409);
    }
    const text = String(note || "").slice(0, 500);
    const done = await LeaveRequest.updateOne(
      { _id: leave._id, status: "approved" },
      { $set: { status: "cancelled", revokedBy: user.id, revokedAt: new Date(), revokeNote: text } }
    );
    if (!done.modifiedCount) return fail("already_decided", 409);
    await audit(user, "leave.revoked", { entityType: "leave", entityId: leave._id, summary: `${leave.from} → ${leave.to}${text ? ` · ${text}` : ""}` });
    await notify({
      type: "leave.revoked",
      recipients: [leave.user.toString()],
      actor: user,
      params: { from: leave.from, to: leave.to },
      link: "/dashboard/orders?type=leave",
      entityType: "leave",
      entityId: leave._id,
    });
    return NextResponse.json({ ok: true });
  }

  if (!["approve", "reject"].includes(decision)) return fail("invalid_request");
  if (leave.user.toString() === user.id) return fail("cannot_approve_own", 403);
  if (leave.status !== "pending") return fail("already_decided", 409);
  if (!canDecideLeave(user, leave, await hrPeopleIds())) return forbidden();
  if ((await hrMonthState(leave.from.slice(0, 7))).closed) return fail("month_closed", 409);

  const stage = leaveStage(leave);
  // Approving annual leave: still within the allowance (it may have changed since).
  if (decision === "approve" && leave.type === "annual") {
    const left = await annualLeft(leave.user, leave.from.slice(0, 4), { withPending: false, exceptId: leave._id });
    if (leave.days > left) return fail("leave_balance_exceeded", 409, { left: Math.max(0, left) });
  }
  const now = new Date();
  const text = String(note || "").slice(0, 500);
  // HR / GM / CEO deciding in the manager's place: the final answer, the manager step skipped.
  const overrule = stage === "manager" && !isStageManager(user, leave);
  // The manager passing it on to HR / GM; anything else is the final answer.
  const forward = stage === "manager" && decision === "approve" && !overrule;
  const set = forward
    ? { stage: "final", managerDecision: { by: user.id, at: now, note: text } }
    : {
        status: decision === "approve" ? "approved" : "rejected",
        decidedBy: user.id,
        decidedAt: now,
        decisionNote: text,
        ...(stage === "manager" && !overrule ? { managerDecision: { by: user.id, at: now, note: text } } : {}),
        ...(overrule ? { stage: "final" } : {}),
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
      link: "/dashboard/orders?type=waiting",
      entityType: "leave",
      entityId: leave._id,
    });
    await notify({
      type: "leave.manager_approved",
      recipients: [owner],
      actor: user,
      params: params_,
      link: "/dashboard/orders?type=leave",
      entityType: "leave",
      entityId: leave._id,
    });
    return NextResponse.json({ ok: true });
  }

  await audit(user, `leave.${updated.status}`, {
    entityType: "leave",
    entityId: leave._id,
    summary: `${leave.from} → ${leave.to}${overrule ? " (manager step skipped)" : ""}`,
  });
  // Approved leave is time off on the employee's plan: work planned on those days moves after them.
  if (updated.status === "approved") {
    const cal = await getWorkCalendar();
    const moved = await clearOverlaps(owner, cal, user);
    if (moved.length) {
      await cascadeFrom(moved, cal, user);
      await trackDelays({ cause: "leave" }, user);
    }
  }
  await notify({
    type: updated.status === "approved" ? "leave.approved" : "leave.rejected",
    recipients: [owner],
    actor: user,
    params: params_,
    link: "/dashboard/orders?type=leave",
    entityType: "leave",
    entityId: leave._id,
  });
  return NextResponse.json({ ok: true });
}
