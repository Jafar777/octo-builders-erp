import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { notify, usersWithPermission } from "@/lib/notify";
import { getSettings } from "@/lib/settings";
import { fromLocal, localParts } from "@/lib/attendance";
import { CAPTURE_TYPES, CHANNELS, PRIORITIES } from "@/lib/office";
import { canUseOffice, createCorrespondence, createItem, dueFor, OFFICE_LINK } from "@/lib/officeServer";
import Interaction from "@/models/Interaction";
import Lead, { LEAD_SOURCES } from "@/models/Lead";
import Meeting from "@/models/Meeting";

const clip = (v, n) => String(v || "").trim().slice(0, n);
const ref = (v) => (isObjectId(v) ? v : null);

// The office's quick capture: one line and a type, saved in a second.
// Body: { type, text, details?, client?, lead?, project?, person?, department?, due? (chip
// or YYYY-MM-DD), priority?, channel?, callback?, nextStep?, contactName?, contactPhone?,
// source?, time? (HH:MM, meetings), link? }
export async function POST(request) {
  const user = await getCurrentUser();
  if (!canUseOffice(user)) return forbidden();
  const b = await readJson(request);
  if (!CAPTURE_TYPES.includes(b.type)) return fail("invalid_request");
  const text = clip(b.text, 300);
  if (!text) return fail("office_text_required");
  const tz = (await getSettings()).hr.timezone;
  const about = { client: ref(b.client), lead: ref(b.lead), project: ref(b.project) };
  const due = dueFor(b.due, tz);
  const priority = PRIORITIES.includes(b.priority) ? b.priority : "normal";

  // A call / message: logged, with a return call or a next step if asked.
  if (b.type === "call") {
    const x = await Interaction.create({
      channel: CHANNELS.includes(b.channel) ? b.channel : "call_in",
      summary: text,
      outcome: clip(b.details, 2000),
      ...about,
      person: ref(b.person),
      contactName: clip(b.contactName, 120),
      contactPhone: clip(b.contactPhone, 40),
      callback: Boolean(b.callback),
      by: user.id,
    });
    // Someone got back to an inquiry: its first contact (the office's response time).
    if (about.lead) await Lead.updateOne({ _id: about.lead, firstContactAt: null }, { $set: { firstContactAt: new Date() } });
    let item = null;
    if (clip(b.nextStep, 300)) {
      item = await createItem(user, { kind: "followup", title: clip(b.nextStep, 300), ...about, due: due || dueFor("tomorrow", tz), priority });
      x.item = item._id;
      await x.save();
    }
    await audit(user, "office.call_logged", { entityType: "interaction", entityId: x._id, summary: text });
    return NextResponse.json({ kind: "interaction", id: String(x._id), item: item ? String(item._id) : null }, { status: 201 });
  }

  // Something to track: a follow-up, a request to a department / person, a complaint, an issue.
  if (["followup", "request", "complaint", "issue"].includes(b.type)) {
    const assignee = ref(b.person);
    const department = assignee ? null : ref(b.department);
    if (b.type === "request" && !assignee && !department) return fail("office_request_target");
    const item = await createItem(user, { kind: b.type, title: text, details: clip(b.details, 4000), ...about, assignee, department, due, priority });
    return NextResponse.json({ kind: "item", id: String(item._id) }, { status: 201 });
  }

  // A meeting: on the given day (default today) at the given time, one hour.
  if (b.type === "meeting") {
    const day = (due ? localParts(due, tz).date : null) || localParts(new Date(), tz).date;
    const start = fromLocal(day, /^\d{1,2}:\d{2}$/.test(b.time || "") ? b.time : "10:00", tz);
    const meeting = await Meeting.create({
      kind: about.client ? "external" : "internal",
      title: text,
      start,
      end: new Date(start.getTime() + 3600000),
      participants: [ref(b.person)].filter(Boolean),
      client: about.client,
      project: about.project,
      organizer: user.id,
    });
    await audit(user, "office.meeting", { entityType: "meeting", entityId: meeting._id, summary: text });
    return NextResponse.json({ kind: "meeting", id: String(meeting._id) }, { status: 201 });
  }

  // Incoming / outgoing file or letter.
  if (b.type === "incoming" || b.type === "outgoing") {
    const link = clip(b.link, 1000);
    const doc = await createCorrespondence(user, {
      direction: b.type === "incoming" ? "in" : "out",
      subject: text,
      counterparty: clip(b.contactName, 200),
      channel: link ? "drive" : "email",
      date: localParts(new Date(), tz).date,
      links: /^https?:\/\//.test(link) ? [link] : [],
      client: about.client,
      project: about.project,
    });
    return NextResponse.json({ kind: "correspondence", id: String(doc._id), ref: doc.ref }, { status: 201 });
  }

  // A new inquiry: a lead in Sales, contacted or not yet.
  if (b.type === "inquiry") {
    const lead = await Lead.create({
      name: clip(b.contactName, 120) || text,
      phone: clip(b.contactPhone, 40),
      need: text,
      source: LEAD_SOURCES.includes(b.source) ? b.source : "other",
      stage: "new",
      client: about.client,
      createdBy: user.id,
    });
    await audit(user, "sales.lead_created", { entityType: "lead", entityId: lead._id, summary: lead.name });
    const sales = (await usersWithPermission("sales.manage")).filter((id) => id !== user.id);
    if (sales.length) {
      await notify({ type: "office.inquiry", recipients: sales, actor: user, params: { name: lead.name, need: text }, link: OFFICE_LINK, entityType: "lead", entityId: lead._id });
    }
    return NextResponse.json({ kind: "lead", id: String(lead._id) }, { status: 201 });
  }

  return fail("invalid_request");
}
