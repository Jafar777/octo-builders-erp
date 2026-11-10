import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import AttendanceDevice from "@/models/AttendanceDevice";

async function load(params) {
  const user = await requireStaff();
  if (!user || !hasPermission(user, "attendance.manage") || user.scope !== "all") return { error: forbidden() };
  const { id } = await params;
  const device = isObjectId(id) ? await AttendanceDevice.findById(id) : null;
  return device ? { user, device } : { error: notFound() };
}

const COMMANDS = ["set_clock", "resend_all"];

// Body (any of): { active, name, syncClock, command: "set_clock" | "resend_all" }.
// Commands wait here until the office agent's next sync picks them up.
export async function PATCH(request, { params }) {
  const { user, device, error } = await load(params);
  if (error) return error;
  const body = await readJson(request);
  const changes = [];
  if (typeof body.active === "boolean") {
    device.active = body.active;
    changes.push(`active=${body.active}`);
  }
  if (typeof body.name === "string" && body.name.trim()) {
    device.name = body.name.trim().slice(0, 80);
    changes.push(`name=${device.name}`);
  }
  if (typeof body.syncClock === "boolean") {
    device.syncClock = body.syncClock;
    changes.push(`syncClock=${body.syncClock}`);
  }
  if (body.command !== undefined) {
    if (!COMMANDS.includes(body.command)) return fail("invalid_request");
    if (!device.commands.some((c) => c.type === body.command)) device.commands.push({ type: body.command, by: user.id });
    changes.push(`command=${body.command}`);
  }
  if (!changes.length) return fail("invalid_request");
  await device.save();
  await audit(user, "attendance.device_updated", { entityType: "device", entityId: device._id, summary: `${device.name} ${changes.join(" ")}` });
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
