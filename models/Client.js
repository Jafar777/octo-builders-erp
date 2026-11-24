import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// A client (a company or a person). Finance bills them (invoices, payments); the executive
// office keeps them as contacts: where they came from, who to talk to, and every call,
// letter, request and project with them (the office's Client 360 view).
const ClientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    notes: { type: String, default: "" },
    kind: { type: String, enum: ["company", "person"], default: "person" },
    source: { type: String, default: "" }, // models/Lead.js LEAD_SOURCES
    whatsapp: { type: String, default: "" },
    city: { type: String, default: "" },
    tags: [{ type: String }],
    // The people to talk to at a company.
    contacts: [new mongoose.Schema({ name: String, role: String, phone: String, whatsapp: String, email: String }, { _id: true })],
    createdBy: { type: ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

ClientSchema.index({ name: 1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.Client) mongoose.deleteModel("Client");
export default mongoose.models.Client || mongoose.model("Client", ClientSchema);
