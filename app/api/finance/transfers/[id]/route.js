import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { cleanMoney } from "@/lib/finance";
import { serializeTransfer } from "@/lib/financeTransfers";
import { notify, usersWithPermission } from "@/lib/notify";
import { getSettings } from "@/lib/settings";
import FundTransfer from "@/models/FundTransfer";

async function load(params) {
  const user = await requirePermission("finance.manage");
  if (!user) return { error: forbidden() };
  const { id } = await params;
  const transfer = isObjectId(id) ? await FundTransfer.findById(id) : null;
  return transfer ? { user, transfer } : { error: notFound() };
}

// Mark as received with what actually arrived.
// Body: { amount, currency, rate, receivedAt }
export async function PATCH(request, { params }) {
  const { user, transfer, error } = await load(params);
  if (error) return error;
  if (transfer.status === "received") return fail("already_received", 409);
  const body = await readJson(request);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.receivedAt || "")) return fail("invalid_date");
  const settings = await getSettings();
  const money = cleanMoney(body, settings.currencies);
  if (money.error) return fail(money.error);

  transfer.set({
    status: "received",
    amountReceived: money.amount,
    currencyReceived: money.currency,
    rateReceived: money.rate,
    baseReceived: money.baseAmount,
    receivedAt: body.receivedAt,
  });
  await transfer.save();
  await audit(user, "finance.transfer_received", { entityType: "transfer", entityId: transfer._id, summary: `${money.amount} ${money.currency}` });
  await notify({
    type: "finance.transfer_received",
    recipients: await usersWithPermission("finance.manage"),
    actor: user,
    params: { amount: money.amount, currency: money.currency },
    link: "/dashboard/finance?tab=transfers",
    entityType: "transfer",
    entityId: transfer._id,
  });
  return NextResponse.json({ transfer: serializeTransfer(transfer.toObject()) });
}

export async function DELETE(request, { params }) {
  const { user, transfer, error } = await load(params);
  if (error) return error;
  await transfer.deleteOne();
  await audit(user, "finance.transfer_deleted", { entityType: "transfer", entityId: transfer._id, details: serializeTransfer(transfer.toObject()) });
  return NextResponse.json({ ok: true });
}
