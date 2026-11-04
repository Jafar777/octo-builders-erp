import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

export const CANDIDATE_STAGES = ["applied", "screening", "interview", "offer", "hired", "rejected"];

// A position the office is hiring for.
const JobOpeningSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    department: { type: ObjectId, ref: "Department", default: null },
    branch: { type: ObjectId, ref: "Branch", default: null },
    description: { type: String, default: "" },
    positions: { type: Number, default: 1 },
    status: { type: String, enum: ["open", "on_hold", "closed"], default: "open" },
    createdBy: { type: ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// Someone applying for an opening, through the stages until hired (they get an account
// and an onboarding checklist as tasks) or turned down.
const CandidateSchema = new mongoose.Schema(
  {
    opening: { type: ObjectId, ref: "JobOpening", required: true },
    name: { type: String, required: true },
    email: { type: String, default: "", lowercase: true, trim: true },
    phone: { type: String, default: "" },
    cvUrl: { type: String, default: "" },
    portfolioUrl: { type: String, default: "" },
    source: { type: String, default: "" },
    stage: { type: String, enum: CANDIDATE_STAGES, default: "applied" },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    notes: [new mongoose.Schema({ text: String, by: { type: ObjectId, ref: "User" }, at: { type: Date, default: Date.now } }, { _id: false })],
    interviews: [
      new mongoose.Schema({ date: String, with: [{ type: ObjectId, ref: "User" }], rating: { type: Number, default: 0 }, note: { type: String, default: "" } }, { _id: false }),
    ],
    startDate: { type: String, default: "" },
    hiredUser: { type: ObjectId, ref: "User", default: null },
    onboarding: [new mongoose.Schema({ title: String, assignee: { type: ObjectId, ref: "User" }, task: { type: ObjectId, ref: "Task" } }, { _id: false })],
    rejectReason: { type: String, default: "" },
    createdBy: { type: ObjectId, ref: "User" },
  },
  { timestamps: true }
);

CandidateSchema.index({ opening: 1, stage: 1 });

if (process.env.NODE_ENV !== "production") {
  if (mongoose.models.JobOpening) mongoose.deleteModel("JobOpening");
  if (mongoose.models.Candidate) mongoose.deleteModel("Candidate");
}

export const JobOpening = mongoose.models.JobOpening || mongoose.model("JobOpening", JobOpeningSchema);
export const Candidate = mongoose.models.Candidate || mongoose.model("Candidate", CandidateSchema);
