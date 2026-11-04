import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// An employee's request to work overtime today (lib/overtime.js). Overtime only counts
// on a day whose request the department manager (or the CEO) approved.
const OvertimeRequestSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: "User", required: true },
    department: { type: ObjectId, ref: "Department", default: null }, // whose manager decides
    date: { type: String, required: true }, // YYYY-MM-DD, HR time zone: the day it was asked
    hours: { type: Number, required: true, min: 0.5, max: 16 }, // asked for
    reason: { type: String, default: "" },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    approvedHours: { type: Number, default: 0 }, // what counts (the manager may approve fewer)
    decidedBy: { type: ObjectId, ref: "User", default: null },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, default: "" },
  },
  { timestamps: true }
);

// One request per employee per day.
OvertimeRequestSchema.index({ user: 1, date: 1 }, { unique: true });
OvertimeRequestSchema.index({ status: 1, department: 1 });
OvertimeRequestSchema.index({ date: 1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.OvertimeRequest) {
  delete mongoose.models.OvertimeRequest;
}

export default mongoose.models.OvertimeRequest || mongoose.model("OvertimeRequest", OvertimeRequestSchema);
