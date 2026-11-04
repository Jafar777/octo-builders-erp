import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

export const PURCHASE_STATUSES = ["pending", "approved", "rejected", "ordered", "received", "cancelled"];

// "I need this bought": asked by anyone with purchasing.request, decided by
// purchasing.approve (their department's, or everyone's with company scope). Linked to
// a task, that task can't start until the purchase is received — like an external
// review wait on the Gantt.
const PurchaseRequestSchema = new mongoose.Schema(
  {
    number: { type: String, default: "" }, // PR-2026-0012
    title: { type: String, required: true },
    description: { type: String, default: "" },
    items: [new mongoose.Schema({ description: String, qty: { type: Number, default: 1 }, unitPrice: { type: Number, default: 0 } }, { _id: false })],
    total: { type: Number, default: 0 },
    currency: { type: String, default: "" },
    supplier: { type: ObjectId, ref: "Supplier", default: null },
    department: { type: ObjectId, ref: "Department", default: null },
    branch: { type: ObjectId, ref: "Branch", default: null },
    project: { type: ObjectId, ref: "WorkProject", default: null },
    task: { type: ObjectId, ref: "Task", default: null }, // waits for this purchase
    neededBy: { type: String, default: "" },
    status: { type: String, enum: PURCHASE_STATUSES, default: "pending" },
    requestedBy: { type: ObjectId, ref: "User", required: true },
    decidedBy: { type: ObjectId, ref: "User", default: null },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, default: "" },
    orderedAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null },
    expense: { type: ObjectId, ref: "FinanceEntry", default: null }, // once paid
    asset: { type: ObjectId, ref: "Asset", default: null }, // once registered
  },
  { timestamps: true }
);

PurchaseRequestSchema.index({ status: 1, createdAt: -1 });
PurchaseRequestSchema.index({ task: 1, status: 1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.PurchaseRequest) mongoose.deleteModel("PurchaseRequest");

export default mongoose.models.PurchaseRequest || mongoose.model("PurchaseRequest", PurchaseRequestSchema);
