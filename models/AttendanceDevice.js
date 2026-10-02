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
  },
  { timestamps: true }
);

export default mongoose.models.AttendanceDevice || mongoose.model("AttendanceDevice", AttendanceDeviceSchema);
