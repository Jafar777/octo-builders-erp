import mongoose from "mongoose";

const ServiceSchema = new mongoose.Schema(
  {
    title: { ar: { type: String, default: "" }, en: { type: String, default: "" } },
    description: { ar: { type: String, default: "" }, en: { type: String, default: "" } },
    category: { type: String, default: "" }, // key of a category in the "services" site content
    icon: { type: String, default: "" }, // key from lib/icons.js
    imageUrl: { type: String, default: "" },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== "production" && mongoose.models.Service) {
  delete mongoose.models.Service;
}

export default mongoose.models.Service || mongoose.model("Service", ServiceSchema);
