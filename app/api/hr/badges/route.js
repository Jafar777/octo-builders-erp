import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { canManageFingerprint, cleanBadge } from "@/lib/fingerprint";
import { HIDDEN_ROLES } from "@/lib/permissions";
import RawPunch, { ACTIVE_PUNCH } from "@/models/RawPunch";
import User from "@/models/User";

// Every fingerprint ID: the ones the device sent (with their punches) and the ones set
// on people, with who it belongs to.
export async function GET() {
  const user = await requireStaff();
  if (!canManageFingerprint(user)) return forbidden();
  const [stats, people] = await Promise.all([
    RawPunch.aggregate([{ $match: ACTIVE_PUNCH }, { $group: { _id: "$badgeId", count: { $sum: 1 }, first: { $min: "$time" }, last: { $max: "$time" } } }]),
    User.find({ role: { $nin: ["user", ...HIDDEN_ROLES] } }, { name: 1, nameAr: 1, badgeId: 1, status: 1, department: 1, avatarUrl: 1 }).sort({ status: 1, name: 1 }).lean(),
  ]);
  const owner = {};
  for (const p of people) if (cleanBadge(p.badgeId)) (owner[cleanBadge(p.badgeId)] ||= []).push(p);
  const ids = new Set([...stats.map((s) => String(s._id)), ...Object.keys(owner)]);
  const statOf = Object.fromEntries(stats.map((s) => [String(s._id), s]));
  const badges = [...ids]
    .map((id) => ({
      badgeId: id,
      count: statOf[id]?.count || 0,
      first: statOf[id]?.first || null,
      last: statOf[id]?.last || null,
      // More than one owner: each of them gets the other's punches — to be fixed.
      owners: (owner[id] || []).map((p) => ({ id: p._id.toString(), name: p.nameAr || p.name, status: p.status })),
    }))
    .sort((a, b) => (Number(a.badgeId) || 1e9) - (Number(b.badgeId) || 1e9) || a.badgeId.localeCompare(b.badgeId));
  return NextResponse.json({
    badges,
    people: people.map((p) => ({ id: p._id.toString(), name: p.nameAr || p.name, status: p.status, badgeId: p.badgeId || "" })),
  });
}

// Body: { badgeId, userId }  → the ID is this person's (taken from whoever had it; the
//                             person's previous ID is freed)
//       { badgeId, userId: null } → the ID belongs to nobody
export async function PUT(request) {
  const user = await requireStaff();
  if (!canManageFingerprint(user)) return forbidden();
  const body = await readJson(request);
  const badgeId = cleanBadge(body.badgeId);
  if (!badgeId) return fail("invalid_request");
  if (body.userId !== null && !isObjectId(body.userId)) return fail("invalid_request");

  const previous = await User.find({ badgeId }, { name: 1, nameAr: 1 }).lean();
  await User.updateMany({ badgeId, ...(body.userId ? { _id: { $ne: body.userId } } : {}) }, { $set: { badgeId: "" } });
  let target = null;
  if (body.userId) {
    target = await User.findByIdAndUpdate(body.userId, { $set: { badgeId } }, { new: true, projection: { name: 1, nameAr: 1 } }).lean();
    if (!target) return fail("not_found", 404);
  }
  await audit(user, "attendance.badge_assigned", {
    entityType: "user",
    entityId: target?._id || previous[0]?._id || null,
    summary: `ID ${badgeId}: ${previous.map((p) => p.nameAr || p.name).join(", ") || "—"} → ${target ? target.nameAr || target.name : "—"}`,
  });
  return NextResponse.json({ ok: true });
}
