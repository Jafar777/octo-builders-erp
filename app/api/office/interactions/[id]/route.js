import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { canUseOffice, lookupNames, serializeInteraction } from "@/lib/officeServer";
import Interaction from "@/models/Interaction";
import Lead from "@/models/Lead";

// { callbackDone: true, outcome } — the call was returned; or { outcome } to add what came of it.
export async function PATCH(request, { params }) {
  const user = await getCurrentUser();
  if (!canUseOffice(user)) return forbidden();
  const { id } = await params;
  const x = isObjectId(id) ? await Interaction.findById(id) : null;
  if (!x) return notFound();
  const b = await readJson(request);
  if (b.callbackDone && x.callback && !x.callbackDoneAt) {
    x.callbackDoneAt = new Date();
    if (x.lead) await Lead.updateOne({ _id: x.lead, firstContactAt: null }, { $set: { firstContactAt: new Date() } });
  }
  if (typeof b.outcome === "string") x.outcome = b.outcome.trim().slice(0, 2000);
  await x.save();
  const names = await lookupNames([x.toObject()]);
  return NextResponse.json({ interaction: serializeInteraction(x.toObject(), names) });
}
