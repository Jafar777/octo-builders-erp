import mongoose from "mongoose";

const BilingualText = {
  ar: { type: String, default: "" },
  en: { type: String, default: "" },
};

const ProjectSchema = new mongoose.Schema(
  {
    title: BilingualText,
    description: BilingualText,
    categories: { type: [String], default: [] }, // keys of categories in the "projects" site content
    location: BilingualText,
    style: BilingualText,
    designers: BilingualText,
    client: BilingualText,
    year: { type: String, default: "" },
    area: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    gallery: { type: [String], default: [] },
    link: { type: String, default: "" },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== "production" && mongoose.models.Project) {
  delete mongoose.models.Project;
}

export default mongoose.models.Project || mongoose.model("Project", ProjectSchema);
