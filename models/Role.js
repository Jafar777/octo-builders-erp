import mongoose from "mongoose";

const RoleSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    name: { ar: { type: String, default: "" }, en: { type: String, default: "" } },
    permissions: { type: [String], default: [] },
    scope: { type: String, enum: ["self", "department", "all"], default: "self" },
    system: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.models.Role || mongoose.model("Role", RoleSchema);
