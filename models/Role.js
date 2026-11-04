import mongoose from "mongoose";

const RoleSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    name: { ar: { type: String, default: "" }, en: { type: String, default: "" } },
    permissions: { type: [String], default: [] },
    scope: { type: String, enum: ["self", "department", "all"], default: "self" },
    system: { type: Boolean, default: false },
    description: { ar: { type: String, default: "" }, en: { type: String, default: "" } },
    // A restricted account (the GM by default): outside the organization — not in the
    // org chart, the staff chats or HR months — and only RESTRICTED_PAGES at most.
    limited: { type: Boolean, default: false },
    // Only these pages (lib/permissions.js PAGES); empty = every page its permissions open.
    pages: { type: [String], default: [] },
    // Its holders can be given tasks of any department, not only their own.
    crossDepartment: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// In development a hot reload keeps the old compiled model, which silently drops any
// field added to the schema since: rebuild it so new fields are saved straight away.
if (process.env.NODE_ENV !== "production" && mongoose.models.Role) mongoose.deleteModel("Role");

export default mongoose.models.Role || mongoose.model("Role", RoleSchema);
