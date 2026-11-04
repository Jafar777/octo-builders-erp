import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// A quotation for a lead: the stages and hours of the work (from a template), the
// delivery date the Gantt expects if it's accepted (each stage given to whoever in its
// department is free first), and the price — the money side only for the CEO / GM.
// Accepted → an intake form, which then follows the normal project approval.
const QuotationSchema = new mongoose.Schema(
  {
    number: { type: String, default: "" }, // Q-2026-0004
    lead: { type: ObjectId, ref: "Lead", default: null },
    clientName: { type: String, required: true },
    phone: { type: String, default: "" },
    projectName: { type: String, required: true },
    department: { type: ObjectId, ref: "Department", default: null },
    template: { type: ObjectId, ref: "ProjectTemplate", default: null },
    stages: [
      new mongoose.Schema(
        { key: { type: String, required: true }, name: { ar: String, en: String }, hours: { type: Number, default: 0 }, department: { type: ObjectId, default: null }, after: { type: [String], default: undefined }, waitForPrevious: { type: Boolean, default: false } },
        { _id: false }
      ),
    ],
    // Money (CEO / GM): stripped from responses for everyone else.
    items: [new mongoose.Schema({ description: { type: String, default: "" }, amount: { type: Number, default: 0 } }, { _id: false })],
    total: { type: Number, default: 0 },
    currency: { type: String, default: "" },
    rate: { type: Number, default: 1 },
    validUntil: { type: String, default: "" },
    // The Gantt's answer when it was last worked out.
    delivery: {
      date: { type: Date, default: null },
      start: { type: Date, default: null },
      computedAt: { type: Date, default: null },
      stages: [new mongoose.Schema({ key: String, person: { type: ObjectId, ref: "User" }, start: Date, end: Date }, { _id: false })],
    },
    status: { type: String, enum: ["draft", "sent", "accepted", "rejected"], default: "draft" },
    intake: { type: ObjectId, ref: "ProjectIntake", default: null },
    notes: { type: String, default: "" },
    createdBy: { type: ObjectId, ref: "User" },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== "production" && mongoose.models.Quotation) mongoose.deleteModel("Quotation");

export default mongoose.models.Quotation || mongoose.model("Quotation", QuotationSchema);
