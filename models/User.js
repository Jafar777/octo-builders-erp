import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },
    // Key of a Role document. New signups are "user" until the GM assigns a role.
    role: { type: String, default: "user" },
    department: { type: ObjectId, ref: "Department", default: null },
    branch: { type: ObjectId, ref: "Branch", default: null },
    jobTitle: { type: ObjectId, ref: "JobTitle", default: null },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    phone: { type: String, default: "" },
    badgeId: { type: String, default: "" }, // fingerprint device ID
    contractStart: { type: String, default: "" }, // YYYY-MM-DD
    contractEnd: { type: String, default: "" },
    // Personal notification choices (see lib/notify.js NOTIFICATION_GROUPS).
    notificationPrefs: {
      muted: [{ type: String }], // groups switched off in-app and by email
      email: { type: String, enum: ["important", "all", "none"], default: "important" },
      digest: { type: Boolean, default: true }, // daily email of unread notifications
      sound: { type: Boolean, default: true },
    },
    // HR file: emergency contact and documents (contract, ID copy, certificates...).
    emergencyContact: {
      name: { type: String, default: "" },
      phone: { type: String, default: "" },
      relation: { type: String, default: "" },
    },
    documents: [
      new mongoose.Schema({
        name: { type: String, required: true },
        url: { type: String, required: true },
        fileId: { type: String, default: "" },
        mime: { type: String, default: "" },
        size: { type: Number, default: 0 },
        uploadedBy: { type: ObjectId, ref: "User" },
        uploadedAt: { type: Date, default: Date.now },
      }),
    ],
    annualLeaveDays: { type: Number, default: 21 },
    kpiExcluded: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
    lastSeenAt: { type: Date },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== "production" && mongoose.models.User) {
  delete mongoose.models.User;
}

export default mongoose.models.User || mongoose.model("User", UserSchema);
