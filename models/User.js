import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },
    role: { type: String, enum: ["admin", "user"], default: "user" },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.models.User || mongoose.model("User", UserSchema);
