import mongoose from "mongoose";

// Frozen payslip of a closed month (attendance summary + payroll lines).
const PayrollRecordSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    month: { type: String, required: true },
    attendance: { type: mongoose.Schema.Types.Mixed, default: {} },
    payroll: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, minimize: false }
);

PayrollRecordSchema.index({ user: 1, month: 1 }, { unique: true });

export default mongoose.models.PayrollRecord || mongoose.model("PayrollRecord", PayrollRecordSchema);
