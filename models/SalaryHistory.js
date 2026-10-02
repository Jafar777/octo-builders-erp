import mongoose from "mongoose";

// Salary periods per employee (the Excel HR_Cost_Engine keeps a row per change).
const SalaryHistorySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "USD" },
    from: { type: String, required: true }, // YYYY-MM-DD
    note: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

SalaryHistorySchema.index({ user: 1, from: -1 });

export default mongoose.models.SalaryHistory || mongoose.model("SalaryHistory", SalaryHistorySchema);
