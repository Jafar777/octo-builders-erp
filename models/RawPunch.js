import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// One fingerprint (or manual / in-app) punch. Check-in/out are derived per day.
//
// HR never removes a punch: deleting one hides it (`deleted`), and editing one hides it
// and adds the corrected punch (`replacedBy` / `editedFrom`). So the device sending it
// again is a duplicate (same person, same second) and doesn't bring it back, and the
// history of every change stays. Everything that counts punches skips the deleted ones
// (ACTIVE_PUNCH).
const RawPunchSchema = new mongoose.Schema(
  {
    badgeId: { type: String, required: true, trim: true },
    time: { type: Date, required: true },
    source: { type: String, enum: ["device", "manual", "web"], default: "device" },
    device: { type: ObjectId, ref: "AttendanceDevice", default: null },
    createdBy: { type: ObjectId, ref: "User", default: null },
    note: { type: String, default: "" },
    deleted: { type: Boolean, default: false },
    deletedBy: { type: ObjectId, ref: "User", default: null },
    deletedAt: { type: Date, default: null },
    replacedBy: { type: ObjectId, ref: "RawPunch", default: null },
    editedFrom: { type: ObjectId, ref: "RawPunch", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

RawPunchSchema.index({ badgeId: 1, time: 1 }, { unique: true });
RawPunchSchema.index({ time: 1 });

// Add to every query that counts punches.
export const ACTIVE_PUNCH = { deleted: { $ne: true } };

export default mongoose.models.RawPunch || mongoose.model("RawPunch", RawPunchSchema);
