import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { todayIn } from "@/lib/hr";
import { localParts } from "@/lib/attendance";
import { canManageFingerprint, cleanBadge, closedMonthOf, punchTime, replacePunch } from "@/lib/fingerprint";
import { getSettings } from "@/lib/settings";
import RawPunch from "@/models/RawPunch";

async function load(params) {
  const user = await requireStaff();
  if (!canManageFingerprint(user)) return { error: forbidden() };
  const { id } = await params;
  const punch = isObjectId(id) ? await RawPunch.findById(id) : null;
  return punch ? { user, punch } : { error: notFound() };
}

// Correct one punch. Body: { date, time (office time), badgeId, note } — any of them.
export async function PATCH(request, { params }) {
  const { user, punch, error } = await load(params);
  if (error) return error;
  if (punch.deleted) return fail("invalid_request");
  const body = await readJson(request);
  const { hr } = await getSettings();
  const tz = hr.timezone;

  const time = body.date || body.time ? punchTime({ date: body.date || localParts(punch.time, tz).date, time: body.time }, tz) : punch.time;
  if (!time || time > new Date(Date.now() + 60000) || localParts(time, tz).date > todayIn(tz)) return fail("invalid_date");
  const badgeId = body.badgeId !== undefined ? cleanBadge(body.badgeId) : punch.badgeId;
  if (!badgeId) return fail("invalid_request");
  if (await closedMonthOf([punch.time, time], tz)) return fail("month_closed", 409);

  const note = body.note !== undefined ? String(body.note).slice(0, 300) : punch.note;
  // Only the note: kept on the punch itself.
  if (time.getTime() === punch.time.getTime() && badgeId === punch.badgeId) {
    punch.note = note;
    await punch.save();
    return NextResponse.json({ ok: true, id: punch._id.toString() });
  }
  const fixed = await replacePunch(punch, { badgeId, time }, user, note);
  if (!fixed) return fail("duplicate_punch", 409);
  await audit(user, "attendance.punch_edited", {
    entityType: "punch",
    entityId: fixed._id,
    summary: `ID ${punch.badgeId} ${punch.time.toISOString()} → ID ${badgeId} ${time.toISOString()}`,
  });
  return NextResponse.json({ ok: true, id: fixed._id.toString() });
}

// Hides the punch (the device sending it again won't bring it back; it can be restored).
export async function DELETE(request, { params }) {
  const { user, punch, error } = await load(params);
  if (error) return error;
  const { hr } = await getSettings();
  if (await closedMonthOf([punch.time], hr.timezone)) return fail("month_closed", 409);
  punch.deleted = true;
  punch.deletedBy = user.id;
  punch.deletedAt = new Date();
  await punch.save();
  await audit(user, "attendance.punch_deleted", { entityType: "punch", entityId: punch._id, summary: `ID ${punch.badgeId} ${punch.time.toISOString()}` });
  return NextResponse.json({ ok: true });
}
