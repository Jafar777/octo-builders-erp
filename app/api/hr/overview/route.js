import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { computeMonth, todayIn } from "@/lib/hr";
import { MONTH_OK, staffInScope } from "@/lib/hrAccess";
import { getSettings } from "@/lib/settings";
import { salaryUnlocked } from "@/lib/salaryLock";

// Everyone in scope for one month: attendance summary, payroll (with payroll.view),
// KPI (with kpi.view). ?month=YYYY-MM
export async function GET(request) {
  const user = await requireStaff();
  if (!user || !hasPermission(user, "attendance.view")) return forbidden();

  const settings = await getSettings();
  const param = new URL(request.url).searchParams.get("month");
  const month = MONTH_OK(param) ? param : todayIn(settings.hr.timezone).slice(0, 7);
  const staff = await staffInScope(user, "attendance.view");
  const data = await computeMonth(month, { staff });
  const mayPay = hasPermission(user, "payroll.view");
  const canPay = mayPay && (await salaryUnlocked(user));
  const canKpi = hasPermission(user, "kpi.view");

  return NextResponse.json({
    month,
    state: data.state,
    rows: data.rows.map((r) => ({
      staff: r.staff,
      summary: r.attendance?.summary || null,
      payroll: canPay ? r.payroll : null,
      kpi: canKpi && r.kpi ? { score: r.kpi.score, grade: r.kpi.grade, rank: r.kpi.rank, bonus: r.kpi.bonus } : null,
    })),
    permissions: {
      manage: hasPermission(user, "attendance.manage"),
      payroll: canPay,
      salaryLocked: mayPay && !canPay,
      payrollManage: hasPermission(user, "payroll.manage"),
    },
  });
}
