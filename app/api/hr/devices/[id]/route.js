import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import AttendanceDevice from "@/models/AttendanceDevice";

async function load(params) {
  const user = await requireStaff();
  if (!user || !hasPermission(user, "attendance.manage") || user.scope !== "all") return { error: forbidden() };
  const { id } = await params;
  const device = isObjectId(id) ? await AttendanceDevice.findById(id) : null;
  return device ? { user, device } : { error: notFound() };
}

// Enable / disable a device key. Body: { active }
export async function PATCH(request, { params }) {
  const { user, device, error } = await load(params);
  if (error) return error;
  const { active } = await readJson(request);
  device.active = Boolean(active);
  await device.save();
  await audit(user, "attendance.device_updated", { entityType: "device", entityId: device._id, summary: `${device.name} active=${device.active}` });
  return NextResponse.json({ ok: true });
}

// Punches already received stay; only the key stops working.
export async function DELETE(request, { params }) {
  const { user, device, error } = await load(params);
  if (error) return error;
  await device.deleteOne();
  await audit(user, "attendance.device_deleted", { entityType: "device", entityId: device._id, summary: device.name });
  return NextResponse.json({ ok: true });
}
