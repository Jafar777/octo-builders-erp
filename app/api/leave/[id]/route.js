import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { hrMonthState } from "@/lib/hr";
import { notify } from "@/lib/notify";
import LeaveRequest from "@/models/LeaveRequest";

// Body: { decision: "approve" | "reject" | "cancel", note }
// approve / reject: HR or GM only (leave.approve). cancel: the employee, while pending.
export async function PATCH(request, { params }) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const { id } = await params;
  const leave = isObjectId(id) ? await LeaveRequest.findById(id) : null;
  if (!leave) return notFound();
  const { decision, note } = await readJson(request);

  if (decision === "cancel") {
    if (leave.user.toString() !== user.id || leave.status !== "pending") return forbidden();
    leave.status = "cancelled";
    await leave.save();
    return NextResponse.json({ ok: true });
  }

  if (!["approve", "reject"].includes(decision)) return fail("invalid_request");
  if (!hasPermission(user, "leave.approve")) return forbidden();
  if (leave.user.toString() === user.id) return fail("cannot_approve_own", 403);
  if (leave.status !== "pending") return fail("already_decided", 409);
  if ((await hrMonthState(leave.from.slice(0, 7))).closed) return fail("month_closed", 409);

  leave.status = decision === "approve" ? "approved" : "rejected";
  leave.decidedBy = user.id;
  leave.decidedAt = new Date();
  leave.decisionNote = String(note || "").slice(0, 500);
  await leave.save();

  await audit(user, `leave.${leave.status}`, { entityType: "leave", entityId: leave._id, summary: `${leave.from} → ${leave.to}` });
  await notify({
    type: leave.status === "approved" ? "leave.approved" : "leave.rejected",
    recipients: [leave.user.toString()],
    actor: user,
    params: { from: leave.from, to: leave.to },
    link: "/dashboard/attendance",
    entityType: "leave",
    entityId: leave._id,
  });
  return NextResponse.json({ ok: true });
}
