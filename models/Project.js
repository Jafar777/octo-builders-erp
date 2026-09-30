import mongoose from "mongoose";

const ProjectSchema = new mongoose.Schema(
  {
    title: { ar: { type: String, default: "" }, en: { type: String, default: "" } },
    description: { ar: { type: String, default: "" }, en: { type: String, default: "" } },
    imageUrl: { type: String, default: "" },
    link: { type: String, default: "" },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.Project || mongoose.model("Project", ProjectSchema);
