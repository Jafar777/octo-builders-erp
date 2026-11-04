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
    client: { type: String, default: "" }, // the customer's name as shown (older projects: free text)
    // The customer's own account (someone who signed up, with no role): they follow the
    // project's progress and review the tasks marked for them.
    customer: { type: ObjectId, ref: "User", default: null },
    department: { type: ObjectId, ref: "Department", required: true },
    branch: { type: ObjectId, ref: "Branch", default: null },
    manager: { type: ObjectId, ref: "User", default: null },
    participants: [{ type: ObjectId, ref: "User" }],
    status: { type: String, enum: ["active", "on_hold", "finished", "archived"], default: "active" },
    priority: { type: String, enum: ["normal", "important", "urgent"], default: "normal" },
    // The CEO's priority order on the Gantt (0 = top, the highest); null = not ranked yet.
    rank: { type: Number, default: null },
    // Former project scale (no longer used — each task's hours are set when the project is created).
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
    // Expected start and delivery saved over time: Baseline 1 when the project is created,
    // then Baseline 2, 3… from the Gantt. `start` = when its first task was planned to
    // start, `end` = when the last task was planned to finish.
    baselines: [
      new mongoose.Schema(
        {
          n: { type: Number, required: true },
          start: { type: Date, default: null },
          end: { type: Date, required: true },
          at: { type: Date, default: Date.now },
          by: { type: ObjectId, ref: "User", default: null },
        },
        { _id: false }
      ),
    ],
    // When the first task starts (once work began: when it did) and when the last task is
    // planned to finish now, and every change of them with its cause.
    forecastStart: { type: Date, default: null },
    forecastEnd: { type: Date, default: null },
    delays: [
      new mongoose.Schema({
        at: { type: Date, default: Date.now },
        from: { type: Date, required: true },
        to: { type: Date, required: true },
        workMs: { type: Number, default: 0 }, // working time between them (negative = earlier)
        field: { type: String, default: "end" }, // "start" (expected start) | "end" (expected delivery)
        // rejected | overrun | started | submitted | approved | cancelled | rescheduled |
        // reassigned | task_added | order_changed
        cause: { type: String, required: true },
        task: { type: ObjectId, ref: "Task", default: null },
        taskNumber: { type: Number, default: null },
        taskProject: { type: ObjectId, ref: "WorkProject", default: null }, // when it's another project's task
        note: { type: String, default: "" },
        by: { type: ObjectId, ref: "User", default: null },
      }),
    ],
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
    // The new-project intake form it was created from (models/ProjectIntake).
    intake: { type: ObjectId, ref: "ProjectIntake", default: null },
  },
  { timestamps: true }
);

WorkProjectSchema.index({ department: 1, status: 1 });
WorkProjectSchema.index({ customer: 1 });

export default mongoose.models.WorkProject || mongoose.model("WorkProject", WorkProjectSchema);
