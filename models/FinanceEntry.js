import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// Every money movement (the Excel "إدخال" sheets), always with its currency, the
// exchange rate used, and the base-currency equivalent so old records never change.
//   contract           base contract value of a project (not cash)
//   adjustment         addition (+) or discount (−) to a contract (not cash)
//   payment            money received from the client → into a branch fund
//   project_expense    money paid for a project ← out of a branch fund
//   operating_expense  office / running cost of a branch ← out of a branch fund
export const ENTRY_KINDS = ["contract", "adjustment", "payment", "project_expense", "operating_expense"];

const FinanceEntrySchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ENTRY_KINDS, required: true },
    project: { type: ObjectId, ref: "WorkProject", default: null },
    client: { type: ObjectId, ref: "Client", default: null },
    branch: { type: ObjectId, ref: "Branch", default: null },
    date: { type: String, required: true }, // YYYY-MM-DD
    category: { type: String, default: "" }, // settings.finance.expenseCategories key
    beneficiary: { type: String, default: "" },
    description: { type: String, default: "" },
    amount: { type: Number, required: true }, // may be negative for discounts
    currency: { type: String, required: true },
    rate: { type: Number, required: true }, // units of `currency` per 1 base currency
    baseAmount: { type: Number, required: true },
    createdBy: { type: ObjectId, ref: "User" },
  },
  { timestamps: true }
);

FinanceEntrySchema.index({ kind: 1, date: 1 });
FinanceEntrySchema.index({ project: 1 });

export default mongoose.models.FinanceEntry || mongoose.model("FinanceEntry", FinanceEntrySchema);
