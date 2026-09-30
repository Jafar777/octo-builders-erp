import mongoose from "mongoose";

const BilingualText = {
  ar: { type: String, default: "" },
  en: { type: String, default: "" },
};

const SectionHeading = {
  title: BilingualText,
  subtitle: BilingualText,
};

const Category = new mongoose.Schema({ key: String, name: BilingualText }, { _id: false });

const SiteContentSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true }, // one document per section
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
      vision: BilingualText,
      mission: BilingualText,
    },
    stats: {
      items: [new mongoose.Schema({ value: String, label: BilingualText }, { _id: false })],
    },
    values: {
      ...SectionHeading,
      items: [
        new mongoose.Schema(
          { icon: String, title: BilingualText, description: BilingualText },
          { _id: false }
        ),
      ],
    },
    services: {
      ...SectionHeading,
      categories: [Category],
    },
    process: {
      ...SectionHeading,
      items: [new mongoose.Schema({ title: BilingualText, description: BilingualText }, { _id: false })],
    },
    projects: {
      ...SectionHeading,
      categories: [Category],
    },
    clients: {
      ...SectionHeading,
      items: [new mongoose.Schema({ name: String, logoUrl: String }, { _id: false })],
    },
    contact: {
      title: BilingualText,
      body: BilingualText,
      email: { type: String, default: "" },
      phone: { type: String, default: "" },
      whatsapp: { type: String, default: "" },
      website: { type: String, default: "" },
      instagram: { type: String, default: "" },
      address: BilingualText,
    },
  },
  { timestamps: true }
);

// Next's dev server keeps the old compiled model across hot reloads; drop it so
// schema changes take effect.
if (process.env.NODE_ENV !== "production" && mongoose.models.SiteContent) {
  delete mongoose.models.SiteContent;
}

export default mongoose.models.SiteContent || mongoose.model("SiteContent", SiteContentSchema);
