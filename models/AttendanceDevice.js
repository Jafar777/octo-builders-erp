import mongoose from "mongoose";

// A fingerprint device (via the office sync agent) allowed to send punches.
// Only a hash of its key is stored; the key is shown once when created.
const AttendanceDeviceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null },
    keyHash: { type: String, required: true, unique: true },
    keyHint: { type: String, default: "" }, // last 4 characters, for recognition
    active: { type: Boolean, default: true },
    lastSeenAt: { type: Date, default: null },
    lastPunchAt: { type: Date, default: null },
    lastError: { type: String, default: "" },
    offlineNotified: { type: Boolean, default: false }, // reset when it syncs again
    // Health, from what the sync agent sends (app/api/attendance/ingest):
    // the device clock minus the server clock (seconds; null = not reported yet),
    // the last batch, and the newest punch time the device holds.
    clockSkewSec: { type: Number, default: null },
    lastBatch: {
      at: { type: Date, default: null },
      received: { type: Number, default: 0 },
      inserted: { type: Number, default: 0 },
      duplicates: { type: Number, default: 0 },
      future: { type: Number, default: 0 }, // punches dated ahead of the server's clock
    },
    totalInserted: { type: Number, default: 0 },
    newestPunch: { type: Date, default: null },
    agentVersion: { type: String, default: "" },
    // Remote control, set in HR → Fingerprint and picked up by the agent (v2) with its
    // next sync (every 30 s): keep the device clock on the office PC's time, and one-off
    // commands — "set_clock" (now), "resend_all" (send every punch the device holds
    // again; the ones already here are ignored).
    syncClock: { type: Boolean, default: false },
    commands: [
      new mongoose.Schema(
        { type: { type: String, enum: ["set_clock", "resend_all"], required: true }, at: { type: Date, default: Date.now }, by: { type: mongoose.Schema.Types.ObjectId, ref: "User" } },
        { _id: false }
      ),
    ],
    lastCommand: { type: String, default: "" }, // the last one delivered, and when
    lastCommandAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.AttendanceDevice || mongoose.model("AttendanceDevice", AttendanceDeviceSchema);
