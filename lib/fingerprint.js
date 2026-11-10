// Managing what the fingerprint device sends: who each fingerprint ID belongs to, and
// every punch (add, correct, move to another ID, delete, restore). Company-wide HR
// (attendance.manage with the "all" scope: the CEO, HR) does it from HR → Fingerprint.

import { hasPermission } from "@/lib/currentUser";
import { hrMonthState } from "@/lib/hr";
import { fromLocal, localParts } from "@/lib/attendance";
import RawPunch from "@/models/RawPunch";

export const canManageFingerprint = (user) => Boolean(user && hasPermission(user, "attendance.manage") && user.scope === "all");

export const cleanBadge = (v) => String(v ?? "").trim().slice(0, 20);

// A punch time from the form: office date + time (preferred), or an ISO instant.
export function punchTime(body, tz) {
  if (body?.date && body?.time) return fromLocal(body.date, body.time, tz);
  const t = body?.at ? new Date(body.at) : null;
  return t && !Number.isNaN(t.getTime()) ? t : null;
}

// A closed month's attendance and payroll are frozen: its punches can't change (reopen
// the month first, HR → Payroll).
export async function closedMonthOf(times, tz) {
  for (const t of times) {
    const month = localParts(new Date(t), tz).date.slice(0, 7);
    if ((await hrMonthState(month)).closed) return month;
  }
  return null;
}

export function serializePunch(p, { people = {}, devices = {}, tz }) {
  const lp = localParts(new Date(p.time), tz);
  const person = people[p.badgeId];
  return {
    id: p._id.toString(),
    badgeId: p.badgeId,
    at: p.time,
    date: lp.date,
    time: `${String(Math.floor(lp.minutes / 60)).padStart(2, "0")}:${String(lp.minutes % 60).padStart(2, "0")}:${String(new Date(p.time).getUTCSeconds()).padStart(2, "0")}`,
    source: p.source,
    device: p.device ? devices[p.device.toString()] || "" : "",
    note: p.note || "",
    person: person ? { id: person._id.toString(), name: person.nameAr || person.name, status: person.status } : null,
    deleted: Boolean(p.deleted),
    edited: Boolean(p.editedFrom),
    receivedAt: p.createdAt || null,
  };
}

// The original is hidden and the corrected punch added (keeps the history, and the
// device re-sending the original is ignored). Null when the target already exists.
export async function replacePunch(original, { badgeId, time }, user, note = "") {
  const existing = await RawPunch.findOne({ badgeId, time });
  if (existing && !existing.deleted) return null;
  let fixed = existing;
  if (fixed) Object.assign(fixed, { deleted: false, deletedBy: null, deletedAt: null, replacedBy: null, editedFrom: original._id, note: note || fixed.note });
  else
    fixed = new RawPunch({
      badgeId,
      time,
      source: original.source,
      device: original.device,
      createdBy: user.id,
      editedFrom: original._id,
      note: [note, original.note].filter(Boolean).join(" · ").slice(0, 300),
    });
  await fixed.save();
  Object.assign(original, { deleted: true, deletedBy: user.id, deletedAt: new Date(), replacedBy: fixed._id });
  await original.save();
  return fixed;
}
