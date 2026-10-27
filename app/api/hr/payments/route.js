import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { canSeePerson, MONTH_OK } from "@/lib/hrAccess";
import { salaryUnlocked } from "@/lib/salaryLock";
import { getSettings } from "@/lib/settings";
import SalaryPayment from "@/models/SalaryPayment";

// The salary actually paid ("received") for a month, next to the calculated one.
// Body: { userId, month: YYYY-MM, amount (empty / null = remove), currency, note }
export async function PUT(request) {
  const user = await requireStaff();
  if (!user || !hasPermission(user, "payroll.manage")) return forbidden();
  const body = await readJson(request);
  // Nobody records their own pay.
  if (!isObjectId(body.userId) || body.userId === user.id || !(await canSeePerson(user, body.userId, "payroll.manage"))) return forbidden();
  if (!(await salaryUnlocked(user))) return forbidden();
  if (!MONTH_OK(body.month)) return fail("invalid_date");

  if (body.amount === null || body.amount === "" || body.amount === undefined) {
    await SalaryPayment.deleteOne({ user: body.userId, month: body.month });
    await audit(user, "payroll.received_cleared", { entityType: "user", entityId: body.userId, summary: body.month });
    return NextResponse.json({ received: null });
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < 0 || amount > 10000000) return fail("invalid_amount");
  const settings = await getSettings();
  const currency = String(body.currency || settings.currencies.base).toUpperCase();
  if (!settings.currencies.list.some((c) => c.code === currency)) return fail("invalid_currency");

  const row = await SalaryPayment.findOneAndUpdate(
    { user: body.userId, month: body.month },
    { amount, currency, note: String(body.note || "").slice(0, 300), by: user.id },
    { upsert: true, new: true }
  ).lean();
  await audit(user, "payroll.received_set", { entityType: "user", entityId: body.userId, summary: `${body.month}: ${amount} ${currency}` });
  return NextResponse.json({ received: { amount: row.amount, currency: row.currency, note: row.note } });
}
