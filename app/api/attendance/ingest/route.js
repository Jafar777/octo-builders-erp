import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import RawPunch from "@/models/RawPunch";
import AttendanceDevice from "@/models/AttendanceDevice";
import { hashDeviceKey } from "@/lib/deviceKeys";

// A punch this far ahead of the server's clock means the device clock is wrong.
const FUTURE_MS = 10 * 60000;

// Called by the office sync agent (tools/octo-sync-agent).
// Header:  X-Device-Key: <key shown once in Dashboard → HR → Devices>
// Body:    { punches: [{ badgeId: "8", time: "2026-09-27T09:04:11+03:00" }],
//            deviceTime?: "<the device clock now, ISO with offset>", error?: "...", agent?: "2" }
// An empty punches list is a heartbeat.
//
// The agent marks punches as sent only after a 200, so anything but already-stored
// punches (a database error…) must fail the request: they're sent again next time.
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
  const now = Date.now();

  const docs = [];
  let invalid = 0;
  for (const p of list) {
    const badgeId = String(p?.badgeId ?? "").trim().slice(0, 20);
    const time = new Date(p?.time);
    if (!badgeId || Number.isNaN(time.getTime())) {
      invalid += 1;
      continue;
    }
    docs.push({ badgeId, time, source: "device", device: device._id });
  }

  let inserted = 0;
  if (docs.length) {
    try {
      inserted = (await RawPunch.insertMany(docs, { ordered: false })).length;
    } catch (err) {
      // Already stored punches (same person, same second) are expected: the agent may
      // send them again. Any other failure: the agent keeps them and retries.
      const errors = err?.writeErrors || err?.result?.getWriteErrors?.() || [];
      const onlyDuplicates = errors.length > 0 && errors.every((e) => (e.code ?? e.err?.code) === 11000);
      if (!onlyDuplicates && err?.code !== 11000) {
        console.error("attendance ingest failed", err);
        return NextResponse.json({ error: "store_failed" }, { status: 503 });
      }
      inserted = err?.insertedDocs?.length ?? err?.result?.insertedCount ?? docs.length - errors.length;
    }
  }
  const future = docs.filter((d) => d.time.getTime() > now + FUTURE_MS).length;
  const newest = docs.reduce((m, d) => (d.time > m ? d.time : m), device.newestPunch || new Date(0));

  const deviceTime = body.deviceTime ? new Date(body.deviceTime) : null;
  if (deviceTime && !Number.isNaN(deviceTime.getTime())) device.clockSkewSec = Math.round((deviceTime.getTime() - now) / 1000);

  device.lastSeenAt = new Date(now);
  device.offlineNotified = false;
  if (inserted) device.lastPunchAt = new Date(now);
  if (docs.length) {
    device.lastBatch = { at: new Date(now), received: docs.length, inserted, duplicates: docs.length - inserted, future };
    device.totalInserted = (device.totalInserted || 0) + inserted;
    if (newest.getTime() > 0) device.newestPunch = newest;
  }
  device.agentVersion = String(body.agent || "").slice(0, 20);
  device.lastError = String(body.error || "").slice(0, 500);
  await device.save();

  return NextResponse.json({ ok: true, received: docs.length, inserted, duplicates: docs.length - inserted, invalid, future });
}
