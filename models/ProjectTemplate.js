import mongoose from "mongoose";

const BilingualText = { ar: { type: String, default: "" }, en: { type: String, default: "" } };

export const StageSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    name: BilingualText,
    taskType: { type: String, default: "" }, // key from settings.tasks.taskTypes
  },
  { _id: false }
);

// A reusable project structure: the pipeline stages (board columns) and the items
// (board rows) a new project starts with.
const ProjectTemplateSchema = new mongoose.Schema(
  {
    name: BilingualText,
    department: { type: mongoose.Schema.Types.ObjectId, ref: "Department", default: null },
    stages: [StageSchema],
    items: [{ type: String }],
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.models.ProjectTemplate || mongoose.model("ProjectTemplate", ProjectTemplateSchema);
