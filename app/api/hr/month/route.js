import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { fail, forbidden } from "@/lib/apiUtils";
import { computeMonth, hrStaff, leaveBalance, todayIn } from "@/lib/hr";
import { canSeePerson, MONTH_OK } from "@/lib/hrAccess";
import { getSettings } from "@/lib/settings";
import { salaryUnlocked } from "@/lib/salaryLock";

// One person's month: attendance days, summary, payslip and KPI.
// ?month=YYYY-MM&userId=<id>  (userId defaults to me)
export async function GET(request) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const params = new URL(request.url).searchParams;
  const settings = await getSettings();
  const month = MONTH_OK(params.get("month")) ? params.get("month") : todayIn(settings.hr.timezone).slice(0, 7);
  const userId = params.get("userId") || user.id;

  if (!(await canSeePerson(user, userId, "attendance.view"))) return forbidden();
  const [person] = await hrStaff({ _id: userId });
  if (!person) return fail("not_found", 404);

  // KPI is relative (department averages, rank), so calculate the whole team and
  // pick this person's row; inactive people are calculated on their own.
  let data = await computeMonth(month);
  let row = data.rows.find((r) => r.staff.id === userId);
  if (!row) {
    data = await computeMonth(month, { staff: [person] });
    row = data.rows[0];
  }
  const self = userId === user.id;
  const [canPay, canKpi, canManage, leave] = await Promise.all([
    self || canSeePerson(user, userId, "payroll.view"),
    self || canSeePerson(user, userId, "kpi.view"),
    hasPermission(user, "attendance.manage") && canSeePerson(user, userId, "attendance.manage"),
    leaveBalance(person, month.slice(0, 4)),
  ]);

  const unlocked = canPay && (await salaryUnlocked(user));
  return NextResponse.json({
    month,
    closed: data.state.closed,
    person,
    attendance: row.attendance,
    payroll: unlocked ? row.payroll : null,
    salaryLocked: Boolean(canPay && !unlocked),
    kpi: canKpi && row.kpi ? { score: row.kpi.score, grade: row.kpi.grade, rank: row.kpi.rank, of: row.kpi.of } : null,
    leave,
    canManage: Boolean(canManage),
    settings: { weekend: settings.calendar.weekend, workHours: settings.workHours, timezone: settings.hr.timezone },
  });
}
