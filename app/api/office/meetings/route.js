import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { getSettings } from "@/lib/settings";
import { fromLocal } from "@/lib/attendance";
import { MEETING_KINDS } from "@/lib/office";
import { canUseOffice, lookupNames, OFFICE_LINK, serializeMeeting } from "@/lib/officeServer";
import Meeting from "@/models/Meeting";

const clip = (v, n) => String(v || "").trim().slice(0, n);
const ref = (v) => (isObjectId(v) ? v : null);

// Meetings: ?from=YYYY-MM-DD&to=YYYY-MM-DD (default: the last week to four weeks ahead).
export async function GET(request) {
  const user = await getCurrentUser();
  if (!canUseOffice(user)) return forbidden();
  const p = new URL(request.url).searchParams;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(p.get("from") || "") ? new Date(`${p.get("from")}T00:00:00Z`) : new Date(Date.now() - 7 * 86400000);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(p.get("to") || "") ? new Date(`${p.get("to")}T23:59:59Z`) : new Date(Date.now() + 28 * 86400000);
  const list = await Meeting.find({ start: { $gte: from, $lte: to } }).sort({ start: 1 }).limit(300).lean();
  const names = await lookupNames(list);
  return NextResponse.json({ meetings: list.map((m) => serializeMeeting(m, names)) });
}

// { kind, title, date (YYYY-MM-DD), time (HH:MM), minutes (length), place, participants[],
//   guests, client, project, agenda } — the participants are invited (a notification).
export async function POST(request) {
  const user = await getCurrentUser();
  if (!canUseOffice(user)) return forbidden();
  const b = await readJson(request);
  const title = clip(b.title, 200);
  if (!title) return fail("office_text_required");
  const tz = (await getSettings()).hr.timezone;
  const start = fromLocal(b.date, b.time || "10:00", tz);
  if (!start) return fail("invalid_date");
  const length = Math.min(600, Math.max(15, Number(b.minutes) || 60));
  const participants = [...new Set((Array.isArray(b.participants) ? b.participants : []).filter(isObjectId))].slice(0, 50);
  const meeting = await Meeting.create({
    kind: MEETING_KINDS.includes(b.kind) ? b.kind : "internal",
    title,
    start,
    end: new Date(start.getTime() + length * 60000),
    place: clip(b.place, 300),
    participants,
    guests: clip(b.guests, 500),
    client: ref(b.client),
    project: ref(b.project),
    agenda: clip(b.agenda, 4000),
    organizer: user.id,
  });
  await audit(user, "office.meeting", { entityType: "meeting", entityId: meeting._id, summary: title });
  const invited = participants.filter((id) => id !== user.id);
  if (invited.length) {
    await notify({ type: "office.meeting_invite", recipients: invited, actor: user, params: { title, date: b.date, time: b.time || "10:00", place: meeting.place }, link: OFFICE_LINK, entityType: "meeting", entityId: meeting._id });
  }
  const names = await lookupNames([meeting.toObject()]);
  return NextResponse.json({ meeting: serializeMeeting(meeting.toObject(), names) }, { status: 201 });
}
