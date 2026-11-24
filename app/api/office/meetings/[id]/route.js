import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { getSettings } from "@/lib/settings";
import { fromLocal } from "@/lib/attendance";
import { MEETING_STATUSES } from "@/lib/office";
import { canUseOffice, createItem, dueFor, lookupNames, OFFICE_LINK, serializeMeeting } from "@/lib/officeServer";
import Meeting from "@/models/Meeting";

const clip = (v, n) => String(v || "").trim().slice(0, n);
const ref = (v) => (isObjectId(v) ? v : null);

// { action, ... }
//   edit     {title, date, time, minutes (length), place, participants, guests, agenda, client, project}
//   status   {to: scheduled|held|cancelled}
//   minutes  {text, share} — the minutes (a meeting with minutes counts as held); share
//            sends them to the participants
//   decision {text, owner, due} — a decision, tracked as an office item
export async function PATCH(request, { params }) {
  const user = await getCurrentUser();
  if (!canUseOffice(user)) return forbidden();
  const { id } = await params;
  const meeting = isObjectId(id) ? await Meeting.findById(id) : null;
  if (!meeting) return notFound();
  const b = await readJson(request);
  const tz = (await getSettings()).hr.timezone;

  if (b.action === "edit") {
    if (b.title !== undefined) meeting.title = clip(b.title, 200) || meeting.title;
    if (b.date || b.time) {
      const length = meeting.end - meeting.start;
      const start = fromLocal(b.date, b.time || "10:00", tz);
      if (!start) return fail("invalid_date");
      meeting.start = start;
      meeting.end = new Date(start.getTime() + (Number(b.minutes) ? Number(b.minutes) * 60000 : length));
    } else if (Number(b.minutes)) meeting.end = new Date(meeting.start.getTime() + Math.min(600, Math.max(15, Number(b.minutes))) * 60000);
    for (const f of ["place", "guests", "agenda"]) if (b[f] !== undefined) meeting[f] = clip(b[f], f === "agenda" ? 4000 : 500);
    if (Array.isArray(b.participants)) meeting.participants = [...new Set(b.participants.filter(isObjectId))].slice(0, 50);
    if (b.client !== undefined) meeting.client = ref(b.client);
    if (b.project !== undefined) meeting.project = ref(b.project);
  } else if (b.action === "status") {
    if (!MEETING_STATUSES.includes(b.to)) return fail("invalid_request");
    meeting.status = b.to;
  } else if (b.action === "minutes") {
    meeting.minutes = clip(b.text, 20000);
    if (meeting.minutes && !meeting.minutesAt) meeting.minutesAt = new Date();
    if (meeting.minutes && meeting.status === "scheduled") meeting.status = "held";
    if (b.share) {
      const to = meeting.participants.map(String).filter((p) => p !== user.id);
      if (to.length) await notify({ type: "office.minutes_shared", recipients: to, actor: user, params: { title: meeting.title }, link: OFFICE_LINK, entityType: "meeting", entityId: meeting._id });
    }
  } else if (b.action === "decision") {
    const text = clip(b.text, 300);
    if (!text) return fail("office_text_required");
    const owner = ref(b.owner);
    const item = await createItem(user, { kind: owner ? "request" : "followup", title: text, details: meeting.title, assignee: owner, due: dueFor(b.due, tz), meeting: meeting._id, client: meeting.client, project: meeting.project });
    meeting.decisions.push({ text, owner, due: item.due, item: item._id });
  } else {
    return fail("invalid_request");
  }
  await meeting.save();
  await audit(user, `office.meeting_${b.action}`, { entityType: "meeting", entityId: meeting._id, summary: meeting.title });
  const names = await lookupNames([meeting.toObject()]);
  return NextResponse.json({ meeting: serializeMeeting(meeting.toObject(), names) });
}
