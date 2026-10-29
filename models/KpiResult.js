import mongoose from "mongoose";

// Frozen KPI of a closed month (the Excel tbl_KPI_Archive).
const KpiResultSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    month: { type: String, required: true },
    total: { type: Number, default: 0 },
    // Department managers: the system part and the GM / CEO rating (0–100) behind `total`.
    systemScore: { type: Number, default: null },
    manualScore: { type: Number, default: null },
    // Department managers' hybrid KPI (lib/kpi/hybrid): share, management, execution, team metrics.
    hybrid: { type: mongoose.Schema.Types.Mixed, default: null },
    grade: { type: mongoose.Schema.Types.Mixed, default: {} },
    rank: { type: Number, default: 0 },
    of: { type: Number, default: 0 },
    indicators: { type: mongoose.Schema.Types.Mixed, default: [] },
    bonus: { type: Number, default: 0 },
  },
  { timestamps: true, minimize: false }
);

KpiResultSchema.index({ user: 1, month: 1 }, { unique: true });
KpiResultSchema.index({ month: 1, total: -1 });

export default mongoose.models.KpiResult || mongoose.model("KpiResult", KpiResultSchema);
