import mongoose from "mongoose";

const ServiceSchema = new mongoose.Schema(
  {
    title: { ar: { type: String, default: "" }, en: { type: String, default: "" } },
    description: { ar: { type: String, default: "" }, en: { type: String, default: "" } },
    imageUrl: { type: String, default: "" },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.Service || mongoose.model("Service", ServiceSchema);
