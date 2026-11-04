import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// A client invoice (no tax: the company doesn't charge any). Drafted by hand or by a
// Gantt milestone with billing when it's reached; issued when the CEO sends it. What's
// been paid on it comes from the project's payments, oldest invoice first
// (lib/ledgerEngine.js) — payments are still recorded as finance entries.
const InvoiceSchema = new mongoose.Schema(
  {
    number: { type: String, default: "" }, // INV-2026-0007, given when issued
    status: { type: String, enum: ["draft", "issued", "void"], default: "draft" },
    project: { type: ObjectId, ref: "WorkProject", default: null },
    milestone: { type: ObjectId, default: null }, // WorkProject.milestones._id
    client: { type: ObjectId, ref: "Client", default: null },
    clientName: { type: String, default: "" },
    branch: { type: ObjectId, ref: "Branch", default: null },
    currency: { type: String, required: true },
    rate: { type: Number, required: true }, // units of `currency` per 1 base currency
    items: [
      new mongoose.Schema(
        { description: { type: String, default: "" }, amount: { type: Number, required: true } },
        { _id: false }
      ),
    ],
    total: { type: Number, default: 0 },
    baseTotal: { type: Number, default: 0 },
    issueDate: { type: String, default: "" }, // YYYY-MM-DD
    dueDate: { type: String, default: "" },
    notes: { type: String, default: "" },
    createdBy: { type: ObjectId, ref: "User" },
    issuedBy: { type: ObjectId, ref: "User", default: null },
    voidReason: { type: String, default: "" },
  },
  { timestamps: true }
);

InvoiceSchema.index({ project: 1, status: 1 });
InvoiceSchema.index({ status: 1, dueDate: 1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.Invoice) mongoose.deleteModel("Invoice");

export default mongoose.models.Invoice || mongoose.model("Invoice", InvoiceSchema);
