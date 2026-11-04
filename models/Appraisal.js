import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// The competencies every review scores (1–5), in order.
export const COMPETENCIES = ["quality", "speed", "teamwork", "communication", "initiative", "reliability"];

// A performance review cycle (e.g. "H1 2026"): opening it gives every employee a review,
// to be done by their department manager (the CEO for those without one).
const AppraisalCycleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
    dueDate: { type: String, default: "" },
    selfReview: { type: Boolean, default: true },
    status: { type: String, enum: ["open", "closed"], default: "open" },
    createdBy: { type: ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const part = {
  scores: { type: Map, of: Number, default: {} },
  comment: { type: String, default: "" },
  at: { type: Date, default: null },
};

// One employee's review in a cycle.
const AppraisalSchema = new mongoose.Schema(
  {
    cycle: { type: ObjectId, ref: "AppraisalCycle", required: true },
    employee: { type: ObjectId, ref: "User", required: true },
    reviewer: { type: ObjectId, ref: "User", default: null },
    self: part,
    manager: { ...part, strengths: { type: String, default: "" }, goals: { type: String, default: "" }, overall: { type: Number, default: 0 } },
    acknowledgedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

AppraisalSchema.index({ cycle: 1, employee: 1 }, { unique: true });
AppraisalSchema.index({ reviewer: 1 });

if (process.env.NODE_ENV !== "production") {
  if (mongoose.models.AppraisalCycle) mongoose.deleteModel("AppraisalCycle");
  if (mongoose.models.Appraisal) mongoose.deleteModel("Appraisal");
}

export const AppraisalCycle = mongoose.models.AppraisalCycle || mongoose.model("AppraisalCycle", AppraisalCycleSchema);
export default mongoose.models.Appraisal || mongoose.model("Appraisal", AppraisalSchema);
