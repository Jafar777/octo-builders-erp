import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import RawPunch from "@/models/RawPunch";
import AttendanceDevice from "@/models/AttendanceDevice";
import { hashDeviceKey } from "@/lib/deviceKeys";

// Called by the office sync agent (tools/octo-sync-agent).
// Header:  X-Device-Key: <key shown once in Dashboard → HR → Devices>
// Body:    { punches: [{ badgeId: "8", time: "2026-09-27T09:04:11+03:00" }], error?: "..." }
// An empty punches list is a heartbeat.
export async function POST(request) {
  const key = request.headers.get("x-device-key");
  if (!key) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await connectDB();
  const device = await AttendanceDevice.findOne({ keyHash: hashDeviceKey(key), active: true });
  if (!device) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body = {};
  try {
    body = await request.json();
  } catch {}
  const list = Array.isArray(body.punches) ? body.punches.slice(0, 5000) : [];

  const docs = [];
  for (const p of list) {
    const badgeId = String(p?.badgeId ?? "").trim().slice(0, 20);
    const time = new Date(p?.time);
    if (!badgeId || Number.isNaN(time.getTime())) continue;
    docs.push({ badgeId, time, source: "device", device: device._id });
  }

  let inserted = 0;
  if (docs.length) {
    try {
      const res = await RawPunch.insertMany(docs, { ordered: false });
      inserted = res.length;
    } catch (err) {
      // Duplicates (already synced punches) are expected; count the rest.
      inserted = err?.insertedDocs?.length ?? err?.result?.insertedCount ?? 0;
    }
  }

  device.lastSeenAt = new Date();
  device.offlineNotified = false;
  if (inserted) device.lastPunchAt = new Date();
  device.lastError = String(body.error || "").slice(0, 500);
  await device.save();

  return NextResponse.json({ ok: true, received: docs.length, inserted });
}
