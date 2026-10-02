import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// Money sent between branch funds (Jeddah → Damascus in the Excel), with what left
// and what actually arrived — the difference is the transfer cost.
const FundTransferSchema = new mongoose.Schema(
  {
    fromBranch: { type: ObjectId, ref: "Branch", required: true },
    toBranch: { type: ObjectId, ref: "Branch", required: true },
    date: { type: String, required: true },
    method: { type: String, default: "" }, // intermediary / method
    amountSent: { type: Number, required: true },
    currencySent: { type: String, required: true },
    rateSent: { type: Number, required: true },
    baseSent: { type: Number, required: true },
    status: { type: String, enum: ["sent", "received"], default: "sent" },
    amountReceived: { type: Number, default: 0 },
    currencyReceived: { type: String, default: "" },
    rateReceived: { type: Number, default: 1 },
    baseReceived: { type: Number, default: 0 },
    receivedAt: { type: String, default: "" },
    note: { type: String, default: "" },
    createdBy: { type: ObjectId, ref: "User" },
  },
  { timestamps: true }
);

FundTransferSchema.index({ date: 1 });

export default mongoose.models.FundTransfer || mongoose.model("FundTransfer", FundTransferSchema);
