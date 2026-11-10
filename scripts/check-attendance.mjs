// Is the fingerprint device delivering? Read-only.
//   npm run attendance:check            (last 14 days)
//   npm run attendance:check -- --days=30
import mongoose from "mongoose";
import { connectScriptDB } from "./connect.mjs";

const { getSettings } = await import("@/lib/settings");
const { localParts } = await import("@/lib/attendance");
const { default: AttendanceDevice } = await import("@/models/AttendanceDevice");
const { default: RawPunch } = await import("@/models/RawPunch");
const { default: User } = await import("@/models/User");

const days = Number((process.argv.find((a) => a.startsWith("--days=")) || "").split("=")[1]) || 14;
const log = console.log;
const ago = (d) => {
  if (!d) return "never";
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  return m < 1 ? "just now" : m < 120 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
const problems = [];

await connectScriptDB(log);
const settings = await getSettings();
const tz = settings.hr?.timezone || "Asia/Damascus";
const local = (d) => {
  const p = localParts(new Date(d), tz);
  return `${p.date} ${String(Math.floor(p.minutes / 60)).padStart(2, "0")}:${String(p.minutes % 60).padStart(2, "0")}`;
};
const today = localParts(new Date(), tz).date;
log(`Office time zone: ${tz} — now ${local(new Date())}\n`);

// ----- devices -----
log("=== Devices ===");
const devices = await AttendanceDevice.find().lean();
if (!devices.length) problems.push("No device is registered (HR → Devices → Add).");
for (const d of devices) {
  const online = d.lastSeenAt && Date.now() - d.lastSeenAt < 10 * 60000;
  log(`  ${d.name}  [${d.active ? (online ? "ONLINE" : "OFFLINE") : "DISABLED"}]  key …${d.keyHint}`);
  log(`    last heartbeat: ${ago(d.lastSeenAt)} · last new punch: ${ago(d.lastPunchAt)} · agent: ${d.agentVersion ? `v${d.agentVersion}` : "v1 (old)"}`);
  if (d.lastBatch?.at) log(`    last batch: ${d.lastBatch.received} sent, ${d.lastBatch.inserted} new, ${d.lastBatch.duplicates} already there, ${d.lastBatch.future} dated in the future`);
  if (d.clockSkewSec != null) log(`    device clock: ${Math.abs(d.clockSkewSec) <= 120 ? "OK" : "WRONG"} (${d.clockSkewSec >= 0 ? "+" : ""}${d.clockSkewSec} s vs the server)`);
  if (d.lastError) log(`    last error: ${d.lastError}`);
  if (d.active && !online) problems.push(`${d.name}: no heartbeat for ${ago(d.lastSeenAt)} — is the agent running on the office PC?`);
  if (d.lastError) problems.push(`${d.name}: the agent reports "${d.lastError}"`);
  if (d.clockSkewSec != null && Math.abs(d.clockSkewSec) > 120) problems.push(`${d.name}: device clock is ${Math.round(d.clockSkewSec / 60)} min off — set its time`);
  if (online && !d.agentVersion) problems.push(`${d.name}: old agent (v1) — copy the new tools/octo-sync-agent/octo_sync.py to the office PC`);
}

// ----- punches per day -----
const since = new Date(Date.now() - days * 86400000);
const punches = await RawPunch.find({ time: { $gte: since } }, { badgeId: 1, time: 1, source: 1, device: 1, createdAt: 1 }).lean();
log(`\n=== Punches per day (last ${days} days) ===`);
const perDay = {};
for (const p of punches) {
  const day = localParts(p.time, tz).date;
  const row = (perDay[day] ||= { device: 0, manual: 0, web: 0, people: new Set() });
  row[p.source] = (row[p.source] || 0) + 1;
  row.people.add(p.badgeId);
}
for (const [day, r] of Object.entries(perDay).sort()) {
  const wd = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  log(`  ${day} ${wd}  device ${String(r.device).padStart(3)}  manual ${String(r.manual).padStart(2)}  web ${String(r.web).padStart(2)}  people ${r.people.size}`);
}
if (!punches.length) problems.push(`No punches at all in the last ${days} days.`);

// ----- who punched today -----
const users = await User.find({}, { name: 1, nameAr: 1, badgeId: 1, status: 1, role: 1 }).lean();
const byBadge = Object.fromEntries(users.filter((u) => u.badgeId).map((u) => [String(u.badgeId).trim(), u]));
log(`\n=== Today (${today}) ===`);
const todays = punches.filter((p) => localParts(p.time, tz).date === today).sort((a, b) => a.time - b.time);
const perBadge = {};
for (const p of todays) (perBadge[p.badgeId] ||= []).push(p);
for (const [badge, list] of Object.entries(perBadge)) {
  const u = byBadge[badge];
  const who = u ? `${u.nameAr || u.name}${u.status !== "active" ? " (inactive account)" : ""}` : "?? not set on anyone";
  log(`  #${badge.padEnd(4)} ${who.padEnd(28)} ${list.map((p) => local(p.time).slice(11)).join("  ")}`);
}
if (!todays.length) log("  (no punches yet today)");
const lag = todays.filter((p) => p.source === "device" && p.createdAt).map((p) => (p.createdAt - p.time) / 1000);
if (lag.length) log(`  delay device → system today: median ${Math.round(lag.sort((a, b) => a - b)[Math.floor(lag.length / 2)])} s`);

// ----- checks -----
const unknown = {};
for (const p of punches) if (!byBadge[String(p.badgeId).trim()]) (unknown[p.badgeId] ||= []).push(p);
if (Object.keys(unknown).length) {
  log("\n=== Fingerprint IDs set on nobody ===");
  for (const [b, list] of Object.entries(unknown)) log(`  #${b}: ${list.length} punches, last ${local(list.reduce((m, p) => (p.time > m ? p.time : m), new Date(0)))}`);
  problems.push(`Fingerprint IDs ${Object.keys(unknown).join(", ")} are set on nobody: their attendance shows nowhere (Staff → edit → fingerprint ID).`);
}
const noBadge = users.filter((u) => u.status === "active" && !u.badgeId && !["user", "ceo", "coder"].includes(u.role));
if (noBadge.length) {
  log("\n=== Active staff without a fingerprint ID ===");
  log(`  ${noBadge.map((u) => u.nameAr || u.name).join(", ")}`);
}
const future = await RawPunch.countDocuments({ time: { $gt: new Date(Date.now() + 10 * 60000) } });
if (future) problems.push(`${future} punches are dated in the future: the device clock is (or was) wrong.`);
// A wrong time zone shows as punches in the middle of the night.
const device = punches.filter((p) => p.source === "device");
const night = device.filter((p) => {
  const h = Math.floor(localParts(p.time, tz).minutes / 60);
  return h < 5 || h >= 23;
});
if (device.length >= 20 && night.length / device.length > 0.1) {
  problems.push(`${Math.round((night.length / device.length) * 100)}% of device punches are between 23:00 and 05:00 office time — check tz_offset in the agent's config.json (should match ${tz}).`);
}

log("\n=== Result ===");
if (!problems.length) log("  Everything looks fine: the device is online and punches are arriving.");
for (const p of problems) log(`  ! ${p}`);
await mongoose.disconnect();
