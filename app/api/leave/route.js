import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, readJson } from "@/lib/apiUtils";
import { leaveWorkingDays } from "@/lib/attendance";
import { hrMonthState } from "@/lib/hr";
import { notify } from "@/lib/notify";
import { getSettings } from "@/lib/settings";
import LeaveRequest from "@/models/LeaveRequest";
import User from "@/models/User";
import { departmentManagers, finalApprovers, isFinalApprover, serializeLeaves } from "@/lib/leave";
import { isDeptManager } from "@/lib/managerKpi";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// ?view=mine (default) | all
//   all: HR / GM / CEO see every request; department managers see their department's.
export async function GET(request) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const view = new URL(request.url).searchParams.get("view") || "mine";
  let query;
  if (view === "mine") query = { user: user.id };
  else if (view === "all" && isFinalApprover(user)) query = {};
  else if (view === "all" && isDeptManager(user) && user.department) {
    // Older requests have no department saved; match them by the person's department.
    const members = await User.find({ department: user.department }, { _id: 1 }).lean();
    query = { $or: [{ department: user.department }, { department: null, user: { $in: members.map((m) => m._id) } }] };
  } else return forbidden();

  const list = await LeaveRequest.find(query).sort({ createdAt: -1 }).limit(300).lean();
  return NextResponse.json({ leaves: await serializeLeaves(list, user) });
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
  const days = leaveWorkingDays(body.from, body.to, settings.calendar, settings.workHours);
  if (!days) return fail("no_working_days");
  const overlap = await LeaveRequest.exists({ user: user.id, status: { $in: ["pending", "approved"] }, from: { $lte: body.to }, to: { $gte: body.from } });
  if (overlap) return fail("leave_overlap", 409);

  // Step 1 goes to the department's managers; without one, straight to HR / GM.
  const managers = await departmentManagers(user.department, user.id);
  const stage = managers.length ? "manager" : "final";

  const leave = await LeaveRequest.create({
    user: user.id,
    department: user.department || null,
    stage,
    type: body.type,
    from: body.from,
    to: body.to,
    days,
    reason: String(body.reason || "").slice(0, 1000),
    attachmentUrl: /^https?:\/\//.test(body.attachmentUrl || "") ? body.attachmentUrl : "",
  });

  await notify({
    type: "leave.requested",
    recipients: stage === "manager" ? managers : await finalApprovers(user.id),
    actor: user,
    params: { actor: user.name || user.email, days, from: body.from, to: body.to },
    link: "/dashboard/hr?tab=leave",
    entityType: "leave",
    entityId: leave._id,
  });
  return NextResponse.json({ leave: (await serializeLeaves([leave.toObject()], user))[0] }, { status: 201 });
}
