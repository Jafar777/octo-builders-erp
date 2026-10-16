import mongoose from "mongoose";

// Month-level HR state: the KPI bonus pool and whether the month is closed.
const HrMonthSchema = new mongoose.Schema(
  {
    month: { type: String, required: true, unique: true }, // YYYY-MM
    bonusPool: { type: Number, default: 0 },
    bonusCurrency: { type: String, default: "USD" },
    // This month's split of the pool for places 1, 2, 3… (empty = Settings → HR default).
    bonusSplit: [{ type: Number }],
    bonusMinScore: { type: Number, default: 0 }, // KPI score needed to receive any bonus
    bonusNote: { type: String, default: "" }, // message to employees on the bonus page
    bonusAnnouncedAt: { type: Date, default: null },
    closed: { type: Boolean, default: false },
    closedAt: { type: Date, default: null },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

export default mongoose.models.HrMonth || mongoose.model("HrMonth", HrMonthSchema);
