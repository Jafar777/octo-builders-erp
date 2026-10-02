import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { canSeePerson } from "@/lib/hrAccess";
import { getSettings } from "@/lib/settings";
import SalaryHistory from "@/models/SalaryHistory";

// New salary period (a raise keeps the old row, like HR_Cost_Engine).
// Body: { userId, amount, currency, from: YYYY-MM-DD, note }
export async function POST(request) {
  const user = await requireStaff();
  if (!user || !hasPermission(user, "payroll.manage")) return forbidden();
  const body = await readJson(request);
  if (!isObjectId(body.userId) || !(await canSeePerson(user, body.userId, "payroll.manage"))) return forbidden();

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < 0 || amount > 10000000) return fail("invalid_amount");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.from || "")) return fail("invalid_date");
  const settings = await getSettings();
  const currency = String(body.currency || settings.currencies.base).toUpperCase();
  if (!settings.currencies.list.some((c) => c.code === currency)) return fail("invalid_currency");

  const row = await SalaryHistory.create({
    user: body.userId,
    amount,
    currency,
    from: body.from,
    note: String(body.note || "").slice(0, 300),
    createdBy: user.id,
  });
  await audit(user, "payroll.salary_set", { entityType: "user", entityId: body.userId, summary: `${amount} ${currency} from ${body.from}` });
  return NextResponse.json({ salary: { id: row._id.toString(), amount, currency, from: row.from, note: row.note } }, { status: 201 });
}
