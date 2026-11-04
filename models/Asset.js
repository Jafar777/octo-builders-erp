import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

export const ASSET_TYPES = ["computer", "monitor", "software", "printer", "phone", "furniture", "equipment", "other"];
export const ASSET_STATUSES = ["in_use", "in_stock", "repair", "retired"];

// The company's equipment and software licences: who holds each one, and when a
// licence expires (the daily job warns 30 days before).
const AssetSchema = new mongoose.Schema(
  {
    tag: { type: String, default: "" }, // AS-0031
    name: { type: String, required: true },
    type: { type: String, enum: ASSET_TYPES, default: "other" },
    serial: { type: String, default: "" },
    holder: { type: ObjectId, ref: "User", default: null },
    branch: { type: ObjectId, ref: "Branch", default: null },
    status: { type: String, enum: ASSET_STATUSES, default: "in_stock" },
    purchaseDate: { type: String, default: "" },
    cost: { type: Number, default: 0 },
    currency: { type: String, default: "" },
    licenseExpiry: { type: String, default: "" }, // YYYY-MM-DD (software)
    expiryWarnedFor: { type: String, default: "" }, // the expiry date already warned about
    notes: { type: String, default: "" },
    history: [
      new mongoose.Schema(
        { at: { type: Date, default: Date.now }, action: String, holder: { type: ObjectId, ref: "User", default: null }, by: { type: ObjectId, ref: "User" }, note: String },
        { _id: false }
      ),
    ],
  },
  { timestamps: true }
);

AssetSchema.index({ holder: 1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.Asset) mongoose.deleteModel("Asset");

export default mongoose.models.Asset || mongoose.model("Asset", AssetSchema);
