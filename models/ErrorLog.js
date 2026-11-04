import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// Errors that happened on the live site (server routes and pages, and the browser),
// grouped: the same error at the same place is one row with a count. The System page
// shows them; resolving one hides it until it happens again.
const ErrorLogSchema = new mongoose.Schema(
  {
    fingerprint: { type: String, required: true, unique: true },
    source: { type: String, enum: ["server", "browser"], default: "server" },
    message: { type: String, default: "" },
    stack: { type: String, default: "" },
    path: { type: String, default: "" },
    route: { type: String, default: "" },
    count: { type: Number, default: 1 },
    firstAt: { type: Date, default: Date.now },
    lastAt: { type: Date, default: Date.now },
    lastUser: { type: ObjectId, ref: "User", default: null },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: ObjectId, ref: "User", default: null },
  },
  { timestamps: false }
);

ErrorLogSchema.index({ lastAt: -1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.ErrorLog) mongoose.deleteModel("ErrorLog");

export default mongoose.models.ErrorLog || mongoose.model("ErrorLog", ErrorLogSchema);
