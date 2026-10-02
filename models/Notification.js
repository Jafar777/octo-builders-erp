import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

const NotificationSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: "User", required: true },
    type: { type: String, default: "general" }, // key in lib/notify.js TEMPLATES
    actor: { type: ObjectId, ref: "User", default: null },
    message: { ar: { type: String, default: "" }, en: { type: String, default: "" } },
    link: { type: String, default: "" },
    entityType: { type: String, default: "" },
    entityId: { type: String, default: "" },
    priority: { type: String, enum: ["normal", "high"], default: "normal" },
    read: { type: Boolean, default: false },
    readAt: { type: Date },
    emailedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

NotificationSchema.index({ user: 1, createdAt: -1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.Notification) {
  delete mongoose.models.Notification;
}

export default mongoose.models.Notification || mongoose.model("Notification", NotificationSchema);
