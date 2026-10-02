import mongoose from "mongoose";

// One document per settings group ("calendar", "workHours", "currencies"...).
const SettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, minimize: false }
);

export default mongoose.models.Setting || mongoose.model("Setting", SettingSchema);
