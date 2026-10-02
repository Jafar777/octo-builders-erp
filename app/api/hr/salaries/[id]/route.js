import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { forbidden, isObjectId, notFound } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { canSeePerson } from "@/lib/hrAccess";
import SalaryHistory from "@/models/SalaryHistory";

export async function DELETE(request, { params }) {
  const user = await requireStaff();
  if (!user || !hasPermission(user, "payroll.manage")) return forbidden();
  const { id } = await params;
  const row = isObjectId(id) ? await SalaryHistory.findById(id) : null;
  if (!row) return notFound();
  if (!(await canSeePerson(user, row.user.toString(), "payroll.manage"))) return forbidden();

  await row.deleteOne();
  await audit(user, "payroll.salary_deleted", { entityType: "user", entityId: row.user, summary: `${row.amount} ${row.currency} from ${row.from}` });
  return NextResponse.json({ ok: true });
}
