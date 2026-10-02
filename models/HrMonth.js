import mongoose from "mongoose";

// Month-level HR state: the KPI bonus pool and whether the month is closed.
const HrMonthSchema = new mongoose.Schema(
  {
    month: { type: String, required: true, unique: true }, // YYYY-MM
    bonusPool: { type: Number, default: 0 },
    bonusCurrency: { type: String, default: "USD" },
    closed: { type: Boolean, default: false },
    closedAt: { type: Date, default: null },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

export default mongoose.models.HrMonth || mongoose.model("HrMonth", HrMonthSchema);
