import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { getSettings } from "@/lib/settings";
import { localParts } from "@/lib/attendance";
import { CORRESPONDENCE_CHANNELS } from "@/lib/office";
import { canUseOffice, cleanAttachments, cleanLinks, createCorrespondence, lookupNames, serializeCorrespondence } from "@/lib/officeServer";
import Correspondence from "@/models/Correspondence";

const clip = (v, n) => String(v || "").trim().slice(0, n);
const ref = (v) => (isObjectId(v) ? v : null);

// The register. ?direction=in|out  ?client=  ?q=
export async function GET(request) {
  const user = await getCurrentUser();
  if (!canUseOffice(user)) return forbidden();
  const p = new URL(request.url).searchParams;
  const query = {};
  if (["in", "out"].includes(p.get("direction"))) query.direction = p.get("direction");
  if (isObjectId(p.get("client"))) query.client = p.get("client");
  const q = clip(p.get("q"), 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (q) query.$or = [{ subject: { $regex: q, $options: "i" } }, { counterparty: { $regex: q, $options: "i" } }, { ref: { $regex: q, $options: "i" } }];
  const list = await Correspondence.find(query).sort({ date: -1, createdAt: -1 }).limit(300).lean();
  const names = await lookupNames(list);
  return NextResponse.json({ correspondence: list.map((c) => serializeCorrespondence(c, names)) });
}

// { direction, subject, counterparty, channel, date, notes, attachments[{name,url,size,mime}],
//   links[], client, project, deliveredTo }
export async function POST(request) {
  const user = await getCurrentUser();
  if (!canUseOffice(user)) return forbidden();
  const b = await readJson(request);
  if (!["in", "out"].includes(b.direction)) return fail("invalid_request");
  const subject = clip(b.subject, 300);
  if (!subject) return fail("office_text_required");
  const tz = (await getSettings()).hr.timezone;
  const doc = await createCorrespondence(user, {
    direction: b.direction,
    subject,
    counterparty: clip(b.counterparty, 200),
    channel: CORRESPONDENCE_CHANNELS.includes(b.channel) ? b.channel : "email",
    date: /^\d{4}-\d{2}-\d{2}$/.test(b.date || "") ? b.date : localParts(new Date(), tz).date,
    notes: clip(b.notes, 2000),
    attachments: cleanAttachments(b.attachments),
    links: cleanLinks(b.links),
    client: ref(b.client),
    project: ref(b.project),
    deliveredTo: clip(b.deliveredTo, 200),
  });
  const names = await lookupNames([doc.toObject()]);
  return NextResponse.json({ correspondence: serializeCorrespondence(doc.toObject(), names) }, { status: 201 });
}
