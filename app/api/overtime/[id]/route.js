import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { canDecideOvertime } from "@/lib/overtime";
import OvertimeRequest from "@/models/OvertimeRequest";

const idStr = (v) => (v ? v.toString() : null);

async function load(params) {
  const { id } = await params;
  return isObjectId(id) ? OvertimeRequest.findById(id) : null;
}

// The department manager (or the CEO): { decision: "approve" | "reject", hours?, note }.
// Approved: the overtime counts, up to `hours` (default: what was asked). Rejected: none.
export async function PATCH(request, { params }) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const req = await load(params);
  if (!req) return notFound();
  if (!canDecideOvertime(user, req)) return req.status === "pending" ? forbidden() : fail("overtime_decided", 409);
  const body = await readJson(request);
  if (!["approve", "reject"].includes(body.decision)) return fail("invalid_request");

  const approve = body.decision === "approve";
  let hours = req.hours;
  if (approve && body.hours !== undefined && body.hours !== "") {
    hours = Math.round(Number(body.hours) * 2) / 2;
    if (!(hours >= 0.5 && hours <= 16)) return fail("invalid_hours");
  }
  req.status = approve ? "approved" : "rejected";
  req.approvedHours = approve ? hours : 0;
  req.decidedBy = user.id;
  req.decidedAt = new Date();
  req.decisionNote = String(body.note || "").trim().slice(0, 1000);
  await req.save();
  await audit(user, approve ? "overtime.approved" : "overtime.rejected", { entityType: "overtime", entityId: req._id, summary: `${req.date} · ${hours}h` });

  await notify({
    type: approve ? "overtime.approved" : "overtime.rejected",
    recipients: [idStr(req.user)],
    actor: user,
    params: { actor: user.name || user.email, hours, date: req.date },
    link: "/dashboard/overtime",
    entityType: "overtime",
    entityId: req._id,
  });
  return NextResponse.json({ ok: true });
}

// The employee withdraws their own request while it's pending.
export async function DELETE(request, { params }) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const req = await load(params);
  if (!req) return notFound();
  if (idStr(req.user) !== user.id) return forbidden();
  if (req.status !== "pending") return fail("overtime_decided", 409);
  await req.deleteOne();
  return NextResponse.json({ ok: true });
}
