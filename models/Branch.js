import mongoose from "mongoose";

const BranchSchema = new mongoose.Schema(
  {
    name: { ar: { type: String, default: "" }, en: { type: String, default: "" } },
    code: { type: String, default: "", trim: true },
    currency: { type: String, default: "USD", uppercase: true, trim: true },
    timezone: { type: String, default: "Asia/Riyadh" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.models.Branch || mongoose.model("Branch", BranchSchema);
