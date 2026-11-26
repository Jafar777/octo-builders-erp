import mongoose from "mongoose";

const BilingualText = { ar: { type: String, default: "" }, en: { type: String, default: "" } };

export const StageSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    name: BilingualText,
    taskType: { type: String, default: "" }, // key from settings.tasks.taskTypes
    // Optional hand-over to another department (set by the GM / CEO only):
    // `department` does this stage's work (null = the project's department), and
    // `after` lists the earlier stages (keys) it waits for; the stage stays locked until
    // they're all finished. `waitForPrevious` = it waits for something (older data: for
    // every earlier stage, when `after` is missing).
    department: { type: mongoose.Schema.Types.ObjectId, ref: "Department", default: null },
    waitForPrevious: { type: Boolean, default: false },
    after: { type: [String], default: undefined },
    // Projects with rows (spaces / sheets): an optional stage is only worked where it was
    // given work (lib/projectRows.js); the others go through every row.
    optional: { type: Boolean, default: false },
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
    // What the work repeats over: "" (nothing), "spaces" or "sheets" (lib/projectRows.js).
    rows: { type: String, enum: ["", "spaces", "sheets"], default: "" },
    items: [{ type: String }],
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.models.ProjectTemplate || mongoose.model("ProjectTemplate", ProjectTemplateSchema);
