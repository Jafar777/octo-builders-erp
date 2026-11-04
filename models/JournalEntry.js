import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// A manual accounting entry (opening balances, owner's money in or out, loans,
// corrections). Everything else in the books is posted automatically from invoices,
// payments, expenses, transfers and payroll (lib/ledgerEngine.js). Base currency.
const JournalEntrySchema = new mongoose.Schema(
  {
    date: { type: String, required: true },
    branch: { type: ObjectId, ref: "Branch", default: null },
    memo: { type: String, default: "" },
    lines: [
      new mongoose.Schema(
        {
          account: { type: String, required: true }, // lib/ledgerEngine.js ACCOUNTS key
          debit: { type: Number, default: 0 },
          credit: { type: Number, default: 0 },
        },
        { _id: false }
      ),
    ],
    createdBy: { type: ObjectId, ref: "User" },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== "production" && mongoose.models.JournalEntry) mongoose.deleteModel("JournalEntry");

export default mongoose.models.JournalEntry || mongoose.model("JournalEntry", JournalEntrySchema);
