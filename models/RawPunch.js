import mongoose from "mongoose";

// One fingerprint (or manual / in-app) punch. Check-in/out are derived per day.
const RawPunchSchema = new mongoose.Schema(
  {
    badgeId: { type: String, required: true, trim: true },
    time: { type: Date, required: true },
    source: { type: String, enum: ["device", "manual", "web"], default: "device" },
    device: { type: mongoose.Schema.Types.ObjectId, ref: "AttendanceDevice", default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    note: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

RawPunchSchema.index({ badgeId: 1, time: 1 }, { unique: true });
RawPunchSchema.index({ time: 1 });

export default mongoose.models.RawPunch || mongoose.model("RawPunch", RawPunchSchema);
