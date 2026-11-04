import { NextResponse } from "next/server";
import { HIDDEN_ROLES, LIMITED_ROLES } from "@/lib/permissions";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { fail, forbidden, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { closeMonth, hrMonthState, reopenMonth } from "@/lib/hr";
import { MONTH_OK } from "@/lib/hrAccess";
import { notify } from "@/lib/notify";
import { getSettings } from "@/lib/settings";
import HrMonth from "@/models/HrMonth";
import User from "@/models/User";

async function guard(params) {
  const user = await requireStaff();
  if (!user || !hasPermission(user, "payroll.manage") || user.scope !== "all") return { error: forbidden() };
  const { month } = await params;
  if (!MONTH_OK(month)) return { error: fail("invalid_date") };
  return { user, month };
}

// The KPI bonus (pool, split, note) is set on the Bonus page: PATCH /api/bonus.

// Body: { action: "close" | "reopen" }
export async function POST(request, { params }) {
  const { user, month, error } = await guard(params);
  if (error) return error;
  const { action } = await readJson(request);

  if (action === "close") {
    const result = await closeMonth(month, user.id);
    if (result.error) return fail(result.error, 409);
    await audit(user, "payroll.month_closed", { entityType: "month", entityId: month, summary: month });
    const staff = await User.find({ status: "active", role: { $nin: ["user", ...LIMITED_ROLES, ...HIDDEN_ROLES] } }, { _id: 1 }).lean();
    await notify({
      type: "payroll.ready",
      recipients: staff.map((s) => s._id.toString()),
      actor: user,
      params: { month },
      link: `/dashboard/attendance?month=${month}`,
    });
    return NextResponse.json(result);
  }
  if (action === "reopen") {
    await reopenMonth(month);
    await audit(user, "payroll.month_reopened", { entityType: "month", entityId: month, summary: month });
    return NextResponse.json({ ok: true });
  }
  return fail("invalid_action");
}
