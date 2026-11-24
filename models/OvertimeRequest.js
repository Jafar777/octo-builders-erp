import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// An employee's request to work overtime today (lib/overtime.js). Overtime only counts
// on a day whose request the department manager (or the CEO) approved.
const OvertimeRequestSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: "User", required: true },
    department: { type: ObjectId, ref: "Department", default: null },
    // The managers who decide, fixed when it was asked (lib/reporting.js: their chart
    // manager, else their department's). Empty on older requests: those go by department.
    managers: [{ type: ObjectId, ref: "User" }],
    // True from the day managers were named on requests: `managers` is then the whole
    // answer (empty = only the CEO), never the department.
    routed: { type: Boolean, default: false },
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
