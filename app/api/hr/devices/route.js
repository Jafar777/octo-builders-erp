import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { hashDeviceKey, newDeviceKey } from "@/lib/deviceKeys";
import AttendanceDevice from "@/models/AttendanceDevice";
import RawPunch, { ACTIVE_PUNCH } from "@/models/RawPunch";

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
  syncClock: Boolean(d.syncClock),
  pendingCommands: (d.commands || []).map((c) => c.type),
  lastCommand: d.lastCommand || "",
  lastCommandAt: d.lastCommandAt || null,
});

export async function GET() {
  const user = await requireStaff();
  if (!user || !hasPermission(user, "attendance.manage")) return forbidden();
  const devices = await AttendanceDevice.find().sort({ createdAt: 1 }).lean();
  // Punches each device delivered in the last 24 hours. (Fingerprint IDs set on nobody:
  // /api/hr/badges.)
  const recent = await RawPunch.aggregate([
    { $match: { time: { $gte: new Date(Date.now() - 24 * 3600000) }, device: { $ne: null }, ...ACTIVE_PUNCH } },
    { $group: { _id: "$device", n: { $sum: 1 } } },
  ]);
  const recentBy = Object.fromEntries(recent.map((x) => [x._id.toString(), x.n]));
  return NextResponse.json({ devices: devices.map((d) => ({ ...serialize(d), last24h: recentBy[d._id.toString()] || 0 })) });
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
