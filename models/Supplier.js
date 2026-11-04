import mongoose from "mongoose";

// A company the office buys from (printing, materials, software, hardware…).
const SupplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    notes: { type: String, default: "" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== "production" && mongoose.models.Supplier) mongoose.deleteModel("Supplier");

export default mongoose.models.Supplier || mongoose.model("Supplier", SupplierSchema);
