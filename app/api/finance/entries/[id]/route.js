import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { cleanEntry, serializeEntry } from "@/lib/financeEntries";
import { getSettings } from "@/lib/settings";
import FinanceEntry from "@/models/FinanceEntry";

async function load(params) {
  const user = await requirePermission("finance.manage");
  if (!user) return { error: forbidden() };
  const { id } = await params;
  const entry = isObjectId(id) ? await FinanceEntry.findById(id) : null;
  return entry ? { user, entry } : { error: notFound() };
}

export async function PATCH(request, { params }) {
  const { user, entry, error } = await load(params);
  if (error) return error;
  const settings = await getSettings();
  const body = { ...serializeEntry(entry.toObject()), ...(await readJson(request)) };
  const result = await cleanEntry(body, settings);
  if (result.error) return fail(result.error);

  const before = serializeEntry(entry.toObject());
  entry.set(result.value);
  await entry.save();
  await audit(user, "finance.entry_updated", { entityType: "finance", entityId: entry._id, summary: entry.kind, details: { before, after: result.value } });
  return NextResponse.json({ entry: serializeEntry(entry.toObject()) });
}

export async function DELETE(request, { params }) {
  const { user, entry, error } = await load(params);
  if (error) return error;
  await entry.deleteOne();
  await audit(user, "finance.entry_deleted", {
    entityType: "finance",
    entityId: entry._id,
    summary: `${entry.kind} ${entry.amount} ${entry.currency} (${entry.date})`,
    details: serializeEntry(entry.toObject()),
  });
  return NextResponse.json({ ok: true });
}
