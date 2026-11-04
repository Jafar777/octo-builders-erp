import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// A year's monthly budget for one line (an expense category, salaries or project
// expenses), for one branch or the whole company (branch null). Base currency.
const BudgetSchema = new mongoose.Schema(
  {
    year: { type: String, required: true },
    branch: { type: ObjectId, ref: "Branch", default: null },
    line: { type: String, required: true }, // "salaries" | "project_expenses" | expense category key
    months: { type: [Number], default: () => Array(12).fill(0) },
    updatedBy: { type: ObjectId, ref: "User" },
  },
  { timestamps: true }
);

BudgetSchema.index({ year: 1, branch: 1, line: 1 }, { unique: true });

if (process.env.NODE_ENV !== "production" && mongoose.models.Budget) mongoose.deleteModel("Budget");

export default mongoose.models.Budget || mongoose.model("Budget", BudgetSchema);
