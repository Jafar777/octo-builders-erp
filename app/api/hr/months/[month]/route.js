import { NextResponse } from "next/server";
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

// Bonus pool for the KPI top 3. Body: { bonusPool, bonusCurrency }
export async function PATCH(request, { params }) {
  const { user, month, error } = await guard(params);
  if (error) return error;
  if ((await hrMonthState(month)).closed) return fail("month_closed", 409);

  const body = await readJson(request);
  const settings = await getSettings();
  const currency = String(body.bonusCurrency || settings.currencies.base).toUpperCase();
  const bonusPool = Math.max(0, Number(body.bonusPool) || 0);
  await HrMonth.findOneAndUpdate({ month }, { month, bonusPool, bonusCurrency: currency }, { upsert: true });
  await audit(user, "payroll.bonus_pool", { entityType: "month", entityId: month, summary: `${bonusPool} ${currency}` });
  return NextResponse.json({ ok: true });
}

// Body: { action: "close" | "reopen" }
export async function POST(request, { params }) {
  const { user, month, error } = await guard(params);
  if (error) return error;
  const { action } = await readJson(request);

  if (action === "close") {
    const result = await closeMonth(month, user.id);
    if (result.error) return fail(result.error, 409);
    await audit(user, "payroll.month_closed", { entityType: "month", entityId: month, summary: month });
    const staff = await User.find({ status: "active", role: { $ne: "user" } }, { _id: 1 }).lean();
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
