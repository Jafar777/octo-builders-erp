import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { canUseOffice, cleanClient, lookupNames, serializeClient, serializeCorrespondence, serializeInteraction, serializeItem, serializeMeeting } from "@/lib/officeServer";
import { viewerLang } from "@/lib/personName";
import Client from "@/models/Client";
import Correspondence from "@/models/Correspondence";
import FinanceEntry from "@/models/FinanceEntry";
import Invoice from "@/models/Invoice";
import Interaction from "@/models/Interaction";
import Lead from "@/models/Lead";
import Meeting from "@/models/Meeting";
import OfficeItem from "@/models/OfficeItem";
import ProjectIntake from "@/models/ProjectIntake";
import Quotation from "@/models/Quotation";
import WorkProject from "@/models/WorkProject";

const idStr = (v) => (v ? String(v._id || v) : null);

// Client 360: the client and everything the company has with them — calls, open items and
// complaints, meetings, correspondence, inquiries, quotations, project forms and projects.
export async function GET(request, { params }) {
  const user = await getCurrentUser();
  if (!canUseOffice(user)) return forbidden();
  const { id } = await params;
  const client = isObjectId(id) ? await Client.findById(id).lean() : null;
  if (!client) return notFound();
  const lang = await viewerLang();
  const leads = await Lead.find({ client: client._id }).sort({ createdAt: -1 }).lean();
  const [interactions, items, meetings, letters, quotations, intakes, projects] = await Promise.all([
    Interaction.find({ $or: [{ client: client._id }, { lead: { $in: leads.map((l) => l._id) } }] }).sort({ at: -1 }).limit(100).lean(),
    OfficeItem.find({ client: client._id }).sort({ createdAt: -1 }).limit(100).lean(),
    Meeting.find({ client: client._id }).sort({ start: -1 }).limit(50).lean(),
    Correspondence.find({ client: client._id }).sort({ date: -1 }).limit(100).lean(),
    Quotation.find({ $or: [{ client: client.name }, { lead: { $in: leads.map((l) => l._id) } }] }).sort({ createdAt: -1 }).limit(50).lean(),
    ProjectIntake.find({ "client.name": client.name }, { number: 1, status: 1, project: 1, createdAt: 1, workProject: 1 }).sort({ createdAt: -1 }).limit(50).lean(),
    WorkProject.find({ client: client.name }, { name: 1, code: 1, status: 1 }).limit(50).lean(),
  ]);
  const names = await lookupNames([...interactions, ...items, ...meetings, ...letters]);
  return NextResponse.json({
    client: serializeClient(client),
    interactions: interactions.map((x) => serializeInteraction(x, names)),
    items: items.map((i) => serializeItem(i, names, user)),
    meetings: meetings.map((m) => serializeMeeting(m, names)),
    correspondence: letters.map((c) => serializeCorrespondence(c, names)),
    leads: leads.map((l) => ({ id: idStr(l._id), name: l.name, stage: l.stage, need: l.need || "", createdAt: l.createdAt })),
    quotations: quotations.map((q) => ({ id: idStr(q._id), number: q.number || "", status: q.status, createdAt: q.createdAt })),
    intakes: intakes.map((i) => ({ id: idStr(i._id), number: i.number, status: i.status, project: i.project?.name || "", createdAt: i.createdAt })),
    projects: projects.map((p) => ({ id: idStr(p._id), name: p.name?.[lang] || p.name?.en || "", code: p.code || "", status: p.status })),
  });
}

export async function PATCH(request, { params }) {
  const user = await getCurrentUser();
  if (!canUseOffice(user)) return forbidden();
  const { id } = await params;
  const client = isObjectId(id) ? await Client.findById(id) : null;
  if (!client) return notFound();
  const data = cleanClient({ ...serializeClient(client.toObject()), ...(await readJson(request)) });
  if (!data.name) return fail("name_required");
  client.set(data);
  await client.save();
  await audit(user, "office.client_updated", { entityType: "client", entityId: client._id, summary: client.name });
  return NextResponse.json({ client: serializeClient(client.toObject()) });
}

// Deletes a client. Not while money is booked to them (finance entries, invoices, a
// priced intake form) — the same rule as Finance. Calls, items, meetings, letters and
// inquiries stay in the record, without the link.
export async function DELETE(request, { params }) {
  const user = await getCurrentUser();
  if (!canUseOffice(user)) return forbidden();
  const { id } = await params;
  const client = isObjectId(id) ? await Client.findById(id) : null;
  if (!client) return notFound();
  const money = await Promise.all([FinanceEntry.exists({ client: client._id }), Invoice.exists({ client: client._id }), ProjectIntake.exists({ "finance.client": client._id })]);
  if (money.some(Boolean)) return fail("in_use", 409);
  const unlink = { $set: { client: null } };
  await Promise.all([
    Interaction.updateMany({ client: client._id }, unlink),
    OfficeItem.updateMany({ client: client._id }, unlink),
    Meeting.updateMany({ client: client._id }, unlink),
    Correspondence.updateMany({ client: client._id }, unlink),
    Lead.updateMany({ client: client._id }, unlink),
  ]);
  await client.deleteOne();
  await audit(user, "office.client_deleted", { entityType: "client", entityId: client._id, summary: client.name });
  return NextResponse.json({ ok: true });
}
