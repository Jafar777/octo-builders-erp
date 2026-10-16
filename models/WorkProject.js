import mongoose from "mongoose";
import { StageSchema } from "@/models/ProjectTemplate";

const { ObjectId } = mongoose.Schema.Types;
const BilingualText = { ar: { type: String, default: "" }, en: { type: String, default: "" } };

// An internal (ERP) project. Named WorkProject because "Project" is the public
// website portfolio model.
const WorkProjectSchema = new mongoose.Schema(
  {
    code: { type: String, default: "", trim: true },
    name: BilingualText,
    client: { type: String, default: "" },
    department: { type: ObjectId, ref: "Department", required: true },
    branch: { type: ObjectId, ref: "Branch", default: null },
    manager: { type: ObjectId, ref: "User", default: null },
    participants: [{ type: ObjectId, ref: "User" }],
    status: { type: String, enum: ["active", "on_hold", "finished", "archived"], default: "active" },
    priority: { type: String, enum: ["normal", "important", "urgent"], default: "normal" },
    // settings.tasks.projectScales key: the maximum hours each task of the project may take.
    scale: { type: String, default: "" },
    // How tasks may start: "ordered" (each stage waits for the earlier ones), "random"
    // (any stage, any time) or "mixed" (each stage's waitForPrevious decides).
    flow: { type: String, enum: ["ordered", "random", "mixed"], default: "mixed" },
    startDate: { type: Date, default: null },
    dueDate: { type: Date, required: true }, // mandatory — most Excel projects had none
    baselineDueDate: { type: Date, default: null },
    folderLink: { type: String, default: "" },
    notes: { type: String, default: "" },
    // Board: one row of stages. (`items` = former board rows, no longer used; kept so old data survives.)
    stages: [StageSchema],
    items: [
      new mongoose.Schema({
        name: { type: String, required: true },
        order: { type: Number, default: 0 },
      }),
    ],
    // Manual cell states from the Excel: "تجاوز يدوي" (skip) / "إنجاز يدوي" (done).
    overrides: [
      new mongoose.Schema(
        {
          item: { type: ObjectId, default: null }, // former board row (old data only)
          stage: { type: String, required: true },
          status: { type: String, enum: ["skip", "done"], required: true },
          reason: { type: String, default: "" },
          by: { type: ObjectId, ref: "User" },
          at: { type: Date, default: Date.now },
        },
        { _id: false }
      ),
    ],
    // Key dates (client delivery, permit…) on the Gantt; reached when `doneAt` is set.
    milestones: [
      new mongoose.Schema({
        name: { type: String, required: true },
        date: { type: Date, required: true },
        dependsOn: [{ type: ObjectId, ref: "Task" }],
        doneAt: { type: Date, default: null },
        baselineDate: { type: Date, default: null },
      }),
    ],
    taskBaselineAt: { type: Date, default: null }, // last "Save baseline" on the Gantt
    // Waiting stages whose department was already told "ready for you".
    handedOff: [{ type: String }],
    finishedAt: { type: Date, default: null },
    // Planned cost in the base currency (0 = no budget) — finance compares it with
    // direct expenses + the allocated salary / overhead share.
    budget: { type: Number, default: 0 },
    budgetAlertSent: { type: Boolean, default: false },
    // Last risk level seen by the daily job, to notify when it gets worse.
    riskLevel: { type: String, default: "" },
    createdBy: { type: ObjectId, ref: "User" },
  },
  { timestamps: true }
);

WorkProjectSchema.index({ department: 1, status: 1 });

export default mongoose.models.WorkProject || mongoose.model("WorkProject", WorkProjectSchema);
