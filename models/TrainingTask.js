import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// A Training Program task (lib/training.js). Kept apart from Task on purpose: it never
// shows on projects, the Gantt, KPI, payroll or finance.
const TrainingTaskSchema = new mongoose.Schema(
  {
    trainee: { type: ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", maxlength: 4000 },
    status: { type: String, enum: ["ongoing", "finished"], default: "ongoing" },
    createdBy: { type: ObjectId, ref: "User", required: true },
    // Given by the GM / CEO (the trainee can't delete it).
    assignedByAdmin: { type: Boolean, default: false },
    finishedAt: { type: Date, default: null },
    // The month it was finished in (YYYY-MM, HR time zone): the monthly ranking.
    month: { type: String, default: "" },
    rating: { type: Number, min: 1, max: 5, default: null },
    ratedBy: { type: ObjectId, ref: "User", default: null },
    ratedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

TrainingTaskSchema.index({ trainee: 1, status: 1 });
TrainingTaskSchema.index({ status: 1, month: 1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.TrainingTask) {
  delete mongoose.models.TrainingTask;
}

export default mongoose.models.TrainingTask || mongoose.model("TrainingTask", TrainingTaskSchema);
