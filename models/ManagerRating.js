import mongoose from "mongoose";

// The GM / CEO's monthly rating of a department manager's work the system can't see
// (settings.managerKpi.criteria, 1–5 each).
const ManagerRatingSchema = new mongoose.Schema(
  {
    month: { type: String, required: true }, // YYYY-MM
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    scores: [new mongoose.Schema({ key: String, score: { type: Number, min: 1, max: 5 } }, { _id: false })],
    note: { type: String, default: "" },
    ratedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

ManagerRatingSchema.index({ month: 1, user: 1 }, { unique: true });

export default mongoose.models.ManagerRating || mongoose.model("ManagerRating", ManagerRatingSchema);
