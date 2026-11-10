import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { hashDeviceKey, newDeviceKey } from "@/lib/deviceKeys";
import AttendanceDevice from "@/models/AttendanceDevice";
import RawPunch from "@/models/RawPunch";
import User from "@/models/User";

const serialize = (d) => ({
  id: d._id.toString(),
  name: d.name,
  branch: d.branch ? d.branch.toString() : null,
  keyHint: d.keyHint,
  active: d.active,
  lastSeenAt: d.lastSeenAt,
  lastPunchAt: d.lastPunchAt,
  lastError: d.lastError,
  clockSkewSec: d.clockSkewSec ?? null,
  lastBatch: d.lastBatch || null,
  totalInserted: d.totalInserted || 0,
  newestPunch: d.newestPunch || null,
  agentVersion: d.agentVersion || "",
});

export async function GET() {
  const user = await requireStaff();
  if (!user || !hasPermission(user, "attendance.manage")) return forbidden();
  const devices = await AttendanceDevice.find().sort({ createdAt: 1 }).lean();
  const since = new Date(Date.now() - 24 * 3600000);
  const [recent, badges, users] = await Promise.all([
    // Punches each device delivered in the last 24 hours.
    RawPunch.aggregate([{ $match: { time: { $gte: since }, device: { $ne: null } } }, { $group: { _id: "$device", n: { $sum: 1 } } }]),
    // Fingerprint IDs seen in the last 60 days…
    RawPunch.aggregate([
      { $match: { time: { $gte: new Date(Date.now() - 60 * 86400000) } } },
      { $group: { _id: "$badgeId", count: { $sum: 1 }, last: { $max: "$time" } } },
    ]),
    User.find({ badgeId: { $nin: ["", null] } }, { badgeId: 1 }).lean(),
  ]);
  const recentBy = Object.fromEntries(recent.map((x) => [x._id.toString(), x.n]));
  const known = new Set(users.map((u) => String(u.badgeId).trim()));
  return NextResponse.json({
    devices: devices.map((d) => ({ ...serialize(d), last24h: recentBy[d._id.toString()] || 0 })),
    // …that are set on nobody: their attendance shows nowhere until HR sets the ID.
    unknownBadges: badges
      .filter((b) => !known.has(String(b._id).trim()))
      .map((b) => ({ badgeId: b._id, count: b.count, last: b.last }))
      .sort((a, b) => b.last - a.last),
  });
}

// Creates a device and returns its key ONCE. Body: { name, branch }
export async function POST(request) {
  const user = await requireStaff();
  if (!user || !hasPermission(user, "attendance.manage") || user.scope !== "all") return forbidden();
  const body = await readJson(request);
  const name = String(body.name || "").trim().slice(0, 80);
  if (!name) return fail("name_required");

  const key = newDeviceKey();
  const device = await AttendanceDevice.create({
    name,
    branch: isObjectId(body.branch) ? body.branch : null,
    keyHash: hashDeviceKey(key),
    keyHint: key.slice(-4),
  });
  await audit(user, "attendance.device_created", { entityType: "device", entityId: device._id, summary: name });
  return NextResponse.json({ device: serialize(device.toObject()), key }, { status: 201 });
}
