import mongoose from "mongoose";

const JobTitleSchema = new mongoose.Schema(
  {
    name: { ar: { type: String, default: "" }, en: { type: String, default: "" } },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.models.JobTitle || mongoose.model("JobTitle", JobTitleSchema);
