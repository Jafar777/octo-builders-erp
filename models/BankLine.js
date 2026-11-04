import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// One line of an imported bank statement, matched to the payment / expense / transfer
// it is (Finance → Bank). Amounts in the account's currency; money in is positive.
const BankLineSchema = new mongoose.Schema(
  {
    branch: { type: ObjectId, ref: "Branch", required: true },
    date: { type: String, required: true },
    description: { type: String, default: "" },
    amount: { type: Number, required: true },
    currency: { type: String, default: "" },
    // A hash of date + amount + description: the same statement imported twice adds nothing.
    key: { type: String, required: true },
    entry: { type: ObjectId, ref: "FinanceEntry", default: null },
    transfer: { type: ObjectId, ref: "FundTransfer", default: null },
    ignored: { type: Boolean, default: false }, // bank fees etc. the CEO chose not to book
    matchedBy: { type: ObjectId, ref: "User", default: null },
    matchedAt: { type: Date, default: null },
    importedBy: { type: ObjectId, ref: "User" },
  },
  { timestamps: true }
);

BankLineSchema.index({ branch: 1, key: 1 }, { unique: true });

if (process.env.NODE_ENV !== "production" && mongoose.models.BankLine) mongoose.deleteModel("BankLine");

export default mongoose.models.BankLine || mongoose.model("BankLine", BankLineSchema);
