import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { canUseOffice, cleanAttachments, cleanLinks, lookupNames, serializeCorrespondence } from "@/lib/officeServer";
import Correspondence from "@/models/Correspondence";

const clip = (v, n) => String(v || "").trim().slice(0, n);

// { subject, counterparty, notes, deliveredTo, received: true, attachments, links }
export async function PATCH(request, { params }) {
  const user = await getCurrentUser();
  if (!canUseOffice(user)) return forbidden();
  const { id } = await params;
  const doc = isObjectId(id) ? await Correspondence.findById(id) : null;
  if (!doc) return notFound();
  const b = await readJson(request);
  if (b.subject !== undefined) doc.subject = clip(b.subject, 300) || doc.subject;
  for (const f of ["counterparty", "deliveredTo"]) if (b[f] !== undefined) doc[f] = clip(b[f], 200);
  if (b.notes !== undefined) doc.notes = clip(b.notes, 2000);
  if (b.received === true && !doc.receivedAt) doc.receivedAt = new Date();
  if (b.received === false) doc.receivedAt = null;
  if (b.attachments !== undefined) doc.attachments = cleanAttachments(b.attachments);
  if (b.links !== undefined) doc.links = cleanLinks(b.links);
  await doc.save();
  await audit(user, "office.correspondence_updated", { entityType: "correspondence", entityId: doc._id, summary: doc.ref });
  const names = await lookupNames([doc.toObject()]);
  return NextResponse.json({ correspondence: serializeCorrespondence(doc.toObject(), names) });
}
