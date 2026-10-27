import mongoose from "mongoose";

// What an employee was actually paid for a month, typed in by payroll ("received").
// The system's calculated salary ("entitled") stays on the payslip; this is the money
// handed over, often rounded (e.g. 200 for 199.40).
const SalaryPaymentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    month: { type: String, required: true }, // YYYY-MM
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    note: { type: String, default: "" },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

SalaryPaymentSchema.index({ user: 1, month: 1 }, { unique: true });

export default mongoose.models.SalaryPayment || mongoose.model("SalaryPayment", SalaryPaymentSchema);
