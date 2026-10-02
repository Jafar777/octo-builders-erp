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
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, default: "" },
  },
  { timestamps: true }
);

LeaveRequestSchema.index({ user: 1, from: 1 });
LeaveRequestSchema.index({ status: 1 });

export default mongoose.models.LeaveRequest || mongoose.model("LeaveRequest", LeaveRequestSchema);
