import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { cleanMoney } from "@/lib/finance";
import { getSettings } from "@/lib/settings";
import BankLine from "@/models/BankLine";
import FinanceEntry from "@/models/FinanceEntry";

// { entry: <id> }  match it to a recorded payment / expense
// { ignore: true|false }  not something to book (or undo that)
// { unmatch: true }
// { createExpense: { category } }  money out that wasn't recorded: book it as an operating expense
export async function PATCH(request, { params }) {
  const user = await requirePermission("finance.manage");
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const line = await BankLine.findById(id);
  if (!line) return notFound();
  const body = await readJson(request);

  if (body.unmatch) {
    Object.assign(line, { entry: null, ignored: false, matchedBy: null, matchedAt: null });
  } else if (typeof body.ignore === "boolean") {
    Object.assign(line, { ignored: body.ignore, entry: null, matchedBy: user.id, matchedAt: new Date() });
  } else if (isObjectId(body.entry)) {
    const entry = await FinanceEntry.findOne({ _id: body.entry, branch: line.branch });
    if (!entry) return fail("invalid_request");
    if (await BankLine.exists({ entry: entry._id, _id: { $ne: line._id } })) return fail("bank_entry_taken", 409);
    Object.assign(line, { entry: entry._id, ignored: false, matchedBy: user.id, matchedAt: new Date() });
  } else if (body.createExpense) {
    if (line.amount >= 0) return fail("invalid_request");
    const settings = await getSettings();
    const category = settings.finance.expenseCategories.some((c) => c.key === body.createExpense.category) ? body.createExpense.category : settings.finance.expenseCategories[0]?.key;
    const money = cleanMoney({ amount: Math.abs(line.amount), currency: line.currency }, settings.currencies);
    if (money.error) return fail(money.error);
    const entry = await FinanceEntry.create({
      kind: "operating_expense",
      branch: line.branch,
      date: line.date,
      category,
      description: line.description,
      ...money,
      createdBy: user.id,
    });
    Object.assign(line, { entry: entry._id, ignored: false, matchedBy: user.id, matchedAt: new Date() });
  } else {
    return fail("invalid_request");
  }
  await line.save();
  return NextResponse.json({ ok: true });
}
