import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// Every sign-in attempt that reached a code check: who, when, from where, and whether
// it worked. Kept 180 days. Shown on the person's profile and to the CEO.
const LoginEventSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: "User", default: null },
    email: { type: String, default: "" },
    at: { type: Date, default: Date.now },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    // "email" (email code only) | "email+app" (email code, then the authenticator app)
    method: { type: String, default: "email" },
    success: { type: Boolean, default: true },
    // Why it failed: invalid_code | expired | too_many_attempts | invalid_app_code
    reason: { type: String, default: "" },
  },
  { timestamps: false }
);

LoginEventSchema.index({ user: 1, at: -1 });
LoginEventSchema.index({ at: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });

if (process.env.NODE_ENV !== "production" && mongoose.models.LoginEvent) mongoose.deleteModel("LoginEvent");

export default mongoose.models.LoginEvent || mongoose.model("LoginEvent", LoginEventSchema);
