import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { hashDeviceKey, newDeviceKey } from "@/lib/deviceKeys";
import AttendanceDevice from "@/models/AttendanceDevice";

const serialize = (d) => ({
  id: d._id.toString(),
  name: d.name,
  branch: d.branch ? d.branch.toString() : null,
  keyHint: d.keyHint,
  active: d.active,
  lastSeenAt: d.lastSeenAt,
  lastPunchAt: d.lastPunchAt,
  lastError: d.lastError,
});

export async function GET() {
  const user = await requireStaff();
  if (!user || !hasPermission(user, "attendance.manage")) return forbidden();
  const devices = await AttendanceDevice.find().sort({ createdAt: 1 }).lean();
  return NextResponse.json({ devices: devices.map(serialize) });
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
