import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    message: { ar: { type: String, default: "" }, en: { type: String, default: "" } },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.models.Notification || mongoose.model("Notification", NotificationSchema);
