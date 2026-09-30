import mongoose from "mongoose";

const BilingualText = {
  ar: { type: String, default: "" },
  en: { type: String, default: "" },
};

const SiteContentSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true }, // "hero" | "about" | "contact"
    hero: {
      mediaType: { type: String, enum: ["image", "video"], default: "image" },
      mediaUrl: { type: String, default: "" },
      title: BilingualText,
      subtitle: BilingualText,
    },
    about: {
      title: BilingualText,
      body: BilingualText,
      imageUrl: { type: String, default: "" },
    },
    contact: {
      title: BilingualText,
      body: BilingualText,
      email: { type: String, default: "" },
      phone: { type: String, default: "" },
      address: BilingualText,
    },
  },
  { timestamps: true }
);

export default mongoose.models.SiteContent || mongoose.model("SiteContent", SiteContentSchema);
