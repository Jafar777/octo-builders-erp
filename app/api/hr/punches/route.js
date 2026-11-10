import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { todayIn } from "@/lib/hr";
import { canSeePerson } from "@/lib/hrAccess";
import { fromLocal, localParts } from "@/lib/attendance";
import { canManageFingerprint, cleanBadge, closedMonthOf, punchTime, replacePunch, serializePunch } from "@/lib/fingerprint";
import { getSettings } from "@/lib/settings";
import AttendanceDevice from "@/models/AttendanceDevice";
import RawPunch, { ACTIVE_PUNCH } from "@/models/RawPunch";
import User from "@/models/User";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LIMIT = 3000;

// The punches of a period (HR → Fingerprint).
// ?from=YYYY-MM-DD&to=YYYY-MM-DD (office dates) &badgeId= &userId= &deleted=1 (also the deleted)
export async function GET(request) {
  const user = await requireStaff();
  if (!canManageFingerprint(user)) return forbidden();
  const q = new URL(request.url).searchParams;
  const { hr } = await getSettings();
  const tz = hr.timezone;
  const today = todayIn(tz);
  const from = DATE.test(q.get("from") || "") ? q.get("from") : today;
  const to = DATE.test(q.get("to") || "") && q.get("to") >= from ? q.get("to") : from;

  const filter = { time: { $gte: fromLocal(from, "00:00", tz), $lt: new Date(fromLocal(to, "00:00", tz).getTime() + 86400000) } };
  if (q.get("deleted") !== "1") Object.assign(filter, ACTIVE_PUNCH);
  if (q.get("userId")) {
    if (!isObjectId(q.get("userId"))) return fail("invalid_request");
    const person = await User.findById(q.get("userId"), { badgeId: 1 }).lean();
    if (!person?.badgeId) return NextResponse.json({ punches: [], from, to, truncated: false });
    filter.badgeId = person.badgeId;
  } else if (q.get("badgeId")) filter.badgeId = cleanBadge(q.get("badgeId"));

  const [punches, people, devices] = await Promise.all([
    RawPunch.find(filter).sort({ time: -1 }).limit(LIMIT + 1).lean(),
    User.find({ badgeId: { $nin: ["", null] } }, { name: 1, nameAr: 1, badgeId: 1, status: 1 }).lean(),
    AttendanceDevice.find({}, { name: 1 }).lean(),
  ]);
  const ctx = {
    tz,
    people: Object.fromEntries(people.map((p) => [cleanBadge(p.badgeId), p])),
    devices: Object.fromEntries(devices.map((d) => [d._id.toString(), d.name])),
  };
  return NextResponse.json({ from, to, truncated: punches.length > LIMIT, punches: punches.slice(0, LIMIT).map((p) => serializePunch(p, ctx)) });
}

// A punch added by hand (the device missed someone).
// Body: { userId | badgeId, date: "YYYY-MM-DD", time: "HH:MM" (office time), note }
//   (older form: { userId, time: ISO })
export async function POST(request) {
  const user = await requireStaff();
  if (!user || !hasPermission(user, "attendance.manage")) return forbidden();
  const body = await readJson(request);
  const { hr } = await getSettings();
  const tz = hr.timezone;

  let badgeId = "";
  if (isObjectId(body.userId)) {
    if (!(await canSeePerson(user, body.userId, "attendance.manage"))) return forbidden();
    const target = await User.findById(body.userId, { badgeId: 1 }).lean();
    badgeId = cleanBadge(target?.badgeId);
    if (!badgeId) return fail("badge_required");
  } else if (body.badgeId && canManageFingerprint(user)) {
    badgeId = cleanBadge(body.badgeId);
  }
  if (!badgeId) return fail("invalid_request");

  const time = body.date ? punchTime(body, tz) : punchTime({ at: body.time }, tz);
  if (!time || time > new Date(Date.now() + 60000)) return fail("invalid_date");
  if (localParts(time, tz).date > todayIn(tz)) return fail("invalid_date");
  if (await closedMonthOf([time], tz)) return fail("month_closed", 409);

  // A punch deleted earlier at this very second comes back instead.
  const hidden = await RawPunch.findOne({ badgeId, time, deleted: true });
  if (hidden) {
    Object.assign(hidden, { deleted: false, deletedBy: null, deletedAt: null, replacedBy: null, note: String(body.note || hidden.note || "").slice(0, 300) });
    await hidden.save();
  } else {
    try {
      await RawPunch.create({ badgeId, time, source: "manual", createdBy: user.id, note: String(body.note || "").slice(0, 300) });
    } catch {
      return fail("duplicate_punch", 409);
    }
  }
  await audit(user, "attendance.manual_punch", { entityType: "punch", entityId: null, summary: `ID ${badgeId} ${time.toISOString()}` });
  return NextResponse.json({ ok: true }, { status: 201 });
}

// Several punches at once. Body: { ids: [...], action: "delete" | "restore" | "move", badgeId (move) }
export async function PATCH(request) {
  const user = await requireStaff();
  if (!canManageFingerprint(user)) return forbidden();
  const body = await readJson(request);
  const ids = (Array.isArray(body.ids) ? body.ids : []).filter(isObjectId).slice(0, 2000);
  if (!ids.length || !["delete", "restore", "move"].includes(body.action)) return fail("invalid_request");
  const { hr } = await getSettings();
  const punches = await RawPunch.find({ _id: { $in: ids } });
  if (await closedMonthOf(punches.map((p) => p.time), hr.timezone)) return fail("month_closed", 409);

  let changed = 0;
  let skipped = 0;
  if (body.action === "delete") {
    const res = await RawPunch.updateMany({ _id: { $in: ids }, deleted: { $ne: true } }, { $set: { deleted: true, deletedBy: user.id, deletedAt: new Date() } });
    changed = res.modifiedCount;
  } else if (body.action === "restore") {
    for (const p of punches.filter((x) => x.deleted)) {
      // A punch that was edited comes back in place of its correction.
      if (p.replacedBy) await RawPunch.updateOne({ _id: p.replacedBy, deleted: { $ne: true } }, { $set: { deleted: true, deletedBy: user.id, deletedAt: new Date() } });
      Object.assign(p, { deleted: false, deletedBy: null, deletedAt: null, replacedBy: null });
      await p.save();
      changed += 1;
    }
  } else {
    const badgeId = cleanBadge(body.badgeId);
    if (!badgeId) return fail("invalid_request");
    for (const p of punches.filter((x) => !x.deleted && x.badgeId !== badgeId)) {
      const moved = await replacePunch(p, { badgeId, time: p.time }, user, `moved from ID ${p.badgeId}`);
      if (moved) changed += 1;
      else skipped += 1;
    }
  }
  await audit(user, `attendance.punches_${body.action}`, { entityType: "punch", entityId: null, summary: `${changed} punches${body.badgeId ? ` → ID ${body.badgeId}` : ""}` });
  return NextResponse.json({ ok: true, changed, skipped });
}
