import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { cleanMoney } from "@/lib/finance";
import { serializeTransfer } from "@/lib/financeTransfers";
import { notify, usersWithPermission } from "@/lib/notify";
import { getSettings } from "@/lib/settings";
import Branch from "@/models/Branch";
import FundTransfer from "@/models/FundTransfer";

export async function GET() {
  const user = await requirePermission("finance.view");
  if (!user) return forbidden();
  const list = await FundTransfer.find().sort({ date: -1, createdAt: -1 }).limit(1000).lean();
  return NextResponse.json({ transfers: list.map(serializeTransfer) });
}

// Body: { fromBranch, toBranch, date, method, amount, currency, rate, note }
export async function POST(request) {
  const user = await requirePermission("finance.manage");
  if (!user) return forbidden();
  const body = await readJson(request);
  if (!isObjectId(body.fromBranch) || !isObjectId(body.toBranch) || body.fromBranch === body.toBranch) return fail("invalid_branches");
  if ((await Branch.countDocuments({ _id: { $in: [body.fromBranch, body.toBranch] } })) !== 2) return fail("invalid_branches");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || "")) return fail("invalid_date");
  const settings = await getSettings();
  const money = cleanMoney(body, settings.currencies);
  if (money.error) return fail(money.error);

  const transfer = await FundTransfer.create({
    fromBranch: body.fromBranch,
    toBranch: body.toBranch,
    date: body.date,
    method: String(body.method || "").slice(0, 120),
    amountSent: money.amount,
    currencySent: money.currency,
    rateSent: money.rate,
    baseSent: money.baseAmount,
    note: String(body.note || "").slice(0, 500),
    createdBy: user.id,
  });
  await audit(user, "finance.transfer_sent", { entityType: "transfer", entityId: transfer._id, summary: `${money.amount} ${money.currency}` });
  await notify({
    type: "finance.transfer_sent",
    recipients: await usersWithPermission("finance.manage"),
    actor: user,
    params: { amount: money.amount, currency: money.currency },
    link: "/dashboard/finance?tab=transfers",
    entityType: "transfer",
    entityId: transfer._id,
  });
  return NextResponse.json({ transfer: serializeTransfer(transfer.toObject()) }, { status: 201 });
}
