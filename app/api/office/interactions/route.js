import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { CHANNELS } from "@/lib/office";
import { canUseOffice, lookupNames, serializeInteraction } from "@/lib/officeServer";
import Interaction from "@/models/Interaction";
import Lead from "@/models/Lead";

const clip = (v, n) => String(v || "").trim().slice(0, n);
const ref = (v) => (isObjectId(v) ? v : null);

// The call / message log. ?client=  ?callbacks=1 (calls still to return)  ?days=30
export async function GET(request) {
  const user = await getCurrentUser();
  if (!canUseOffice(user)) return forbidden();
  const p = new URL(request.url).searchParams;
  const query = {};
  if (isObjectId(p.get("client"))) query.client = p.get("client");
  if (p.get("callbacks") === "1") Object.assign(query, { callback: true, callbackDoneAt: null });
  else query.at = { $gte: new Date(Date.now() - Math.min(365, Number(p.get("days")) || 30) * 86400000) };
  const list = await Interaction.find(query).sort({ at: -1 }).limit(300).lean();
  const names = await lookupNames(list);
  return NextResponse.json({ interactions: list.map((x) => serializeInteraction(x, names)) });
}

// { channel, summary, outcome, client, lead, project, person, contactName, contactPhone, callback }
export async function POST(request) {
  const user = await getCurrentUser();
  if (!canUseOffice(user)) return forbidden();
  const b = await readJson(request);
  const summary = clip(b.summary, 300);
  if (!summary) return fail("office_text_required");
  const x = await Interaction.create({
    channel: CHANNELS.includes(b.channel) ? b.channel : "call_in",
    summary,
    outcome: clip(b.outcome, 2000),
    client: ref(b.client),
    lead: ref(b.lead),
    project: ref(b.project),
    person: ref(b.person),
    contactName: clip(b.contactName, 120),
    contactPhone: clip(b.contactPhone, 40),
    callback: Boolean(b.callback),
    by: user.id,
  });
  if (x.lead) await Lead.updateOne({ _id: x.lead, firstContactAt: null }, { $set: { firstContactAt: new Date() } });
  await audit(user, "office.call_logged", { entityType: "interaction", entityId: x._id, summary });
  const names = await lookupNames([x.toObject()]);
  return NextResponse.json({ interaction: serializeInteraction(x.toObject(), names) }, { status: 201 });
}
