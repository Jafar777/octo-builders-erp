import mongoose from "mongoose";

const LeaveRequestSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["annual", "sick", "unpaid"], required: true },
    from: { type: String, required: true }, // YYYY-MM-DD
    to: { type: String, required: true },
    days: { type: Number, default: 0 }, // working days, computed
    reason: { type: String, default: "" },
    attachmentUrl: { type: String, default: "" },
    status: { type: String, enum: ["pending", "approved", "rejected", "cancelled"], default: "pending" },
    // Requester's department when they asked (whose manager decides first).
    department: { type: mongoose.Schema.Types.ObjectId, ref: "Department", default: null },
    // Who decides next while pending: the department manager, then HR / GM (either one).
    // Requests from before the two-step flow have no stage and count as "final".
    stage: { type: String, enum: ["manager", "final"], default: "final" },
    managerDecision: {
      by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      at: { type: Date, default: null },
      note: { type: String, default: "" },
    },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, default: "" },
  },
  { timestamps: true }
);

LeaveRequestSchema.index({ user: 1, from: 1 });
LeaveRequestSchema.index({ status: 1, stage: 1 });
LeaveRequestSchema.index({ department: 1 });

export default mongoose.models.LeaveRequest || mongoose.model("LeaveRequest", LeaveRequestSchema);
