import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { fail, forbidden, readJson } from "@/lib/apiUtils";
import { leaveWorkingDays } from "@/lib/attendance";
import { hrMonthState } from "@/lib/hr";
import { notify, usersWithPermission } from "@/lib/notify";
import { getSettings } from "@/lib/settings";
import LeaveRequest from "@/models/LeaveRequest";
import { serializeLeaves } from "@/lib/leave";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// ?view=mine (default) | pending | all  (pending/all need leave.approve — HR & GM)
export async function GET(request) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const view = new URL(request.url).searchParams.get("view") || "mine";
  let query;
  if (view === "mine") query = { user: user.id };
  else if (hasPermission(user, "leave.approve")) query = view === "pending" ? { status: "pending" } : {};
  else return forbidden();

  const list = await LeaveRequest.find(query).sort({ createdAt: -1 }).limit(300).lean();
  return NextResponse.json({ leaves: await serializeLeaves(list) });
}

// Body: { type: annual|sick|unpaid, from, to, reason, attachmentUrl }
export async function POST(request) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const body = await readJson(request);
  if (!["annual", "sick", "unpaid"].includes(body.type)) return fail("invalid_request");
  if (!DATE.test(body.from || "") || !DATE.test(body.to || "") || body.to < body.from) return fail("invalid_date");
  if ((await hrMonthState(body.from.slice(0, 7))).closed) return fail("month_closed", 409);

  const settings = await getSettings();
  const days = leaveWorkingDays(body.from, body.to, settings.calendar);
  if (!days) return fail("no_working_days");
  const overlap = await LeaveRequest.exists({ user: user.id, status: { $in: ["pending", "approved"] }, from: { $lte: body.to }, to: { $gte: body.from } });
  if (overlap) return fail("leave_overlap", 409);

  const leave = await LeaveRequest.create({
    user: user.id,
    type: body.type,
    from: body.from,
    to: body.to,
    days,
    reason: String(body.reason || "").slice(0, 1000),
    attachmentUrl: /^https?:\/\//.test(body.attachmentUrl || "") ? body.attachmentUrl : "",
  });

  await notify({
    type: "leave.requested",
    recipients: await usersWithPermission("leave.approve"),
    actor: user,
    params: { actor: user.name || user.email, days, from: body.from, to: body.to },
    link: "/dashboard/hr?tab=leave",
    entityType: "leave",
    entityId: leave._id,
  });
  return NextResponse.json({ leave: (await serializeLeaves([leave.toObject()]))[0] }, { status: 201 });
}
