import mongoose from "mongoose";

// HR correction of one employee-day (the Excel tbl_ManualOverrides).
const AttendanceOverrideSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    status: { type: String, default: "" }, // "" = automatic
    exemptWarnings: { type: Boolean, default: false }, // "إنذار معفي"
    bonus: { type: Number, default: 0 },
    note: { type: String, default: "" },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

AttendanceOverrideSchema.index({ user: 1, date: 1 }, { unique: true });

export default mongoose.models.AttendanceOverride || mongoose.model("AttendanceOverride", AttendanceOverrideSchema);
