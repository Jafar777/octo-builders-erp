import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

export const TASK_KINDS = ["task", "revision", "help", "meeting", "personal"];
export const TASK_STATUSES = [
  "todo", // assigned / ready, not started
  "in_progress", // On Going
  "on_hold", // ON Hold
  "help", // Help Me — paused while waiting for a colleague
  "submitted", // End Task — waiting for the head (Pending)
  "approved",
  "rejected",
  "done", // meetings / personal tasks finish without review
  "cancelled",
];

const TaskSchema = new mongoose.Schema(
  {
    number: { type: Number, required: true, unique: true },
    kind: { type: String, enum: TASK_KINDS, default: "task" },
    title: { type: String, default: "" }, // free text for meetings / personal tasks
    project: { type: ObjectId, ref: "WorkProject", default: null },
    item: { type: ObjectId, default: null }, // WorkProject.items._id
    stage: { type: String, default: "" }, // WorkProject.stages.key
    department: { type: ObjectId, ref: "Department", default: null },
    type: { type: String, default: "" }, // settings.tasks.taskTypes key
    assignee: { type: ObjectId, ref: "User", required: true },
    createdBy: { type: ObjectId, ref: "User", required: true },
    priority: { type: String, enum: ["normal", "important", "urgent"], default: "normal" },
    revision: { type: Number, default: 0 }, // R-00, R-01...
    previousTask: { type: ObjectId, ref: "Task", default: null }, // revision chain / help origin
    parentTask: { type: ObjectId, ref: "Task", default: null }, // sub-task of
    // Predecessors: this task can't start until all of them are approved / done.
    dependsOn: [{ type: ObjectId, ref: "Task" }],
    // Repeating tasks: the root keeps the rule, the daily job creates the copies.
    recurrence: {
      freq: { type: String, enum: ["", "daily", "weekly", "monthly"], default: "" },
      interval: { type: Number, default: 1 },
      until: { type: Date, default: null },
      nextAt: { type: Date, default: null }, // due date of the next copy
    },
    recurrenceOf: { type: ObjectId, ref: "Task", default: null },
    status: { type: String, enum: TASK_STATUSES, default: "todo" },

    plannedStart: { type: Date, default: null },
    dueAt: { type: Date, default: null },
    estimatedHours: { type: Number, default: 0 },
    deliveryLink: { type: String, default: "" },
    attachments: [
      new mongoose.Schema({ url: String, name: String, mime: String, size: Number }, { _id: false }),
    ],
    description: { type: String, default: "" },
    employeeNotes: { type: String, default: "" },

    // Time tracking: active time only counts while "in_progress".
    startedAt: { type: Date, default: null },
    lastResumedAt: { type: Date, default: null },
    pausedAt: { type: Date, default: null },
    activeMs: { type: Number, default: 0 },
    holdMs: { type: Number, default: 0 },
    submittedAt: { type: Date, default: null },

    // Head review.
    reviewedBy: { type: ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    ratings: [{ type: String }], // settings.tasks.ratingTags keys
    stars: { type: Number, min: 0, max: 5, default: 0 }, // 1–5 from the head; 0 = not rated
    headNotes: { type: String, default: "" },
    rejectCause: { type: String, enum: ["", "employee", "management", "project"], default: "" },

    dueReminderSent: { type: Boolean, default: false },
    overdueNotified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

TaskSchema.index({ assignee: 1, status: 1 });
TaskSchema.index({ project: 1, item: 1, stage: 1, revision: -1 });
TaskSchema.index({ department: 1, status: 1 });
TaskSchema.index({ parentTask: 1 });
TaskSchema.index({ dependsOn: 1 });
TaskSchema.index({ "recurrence.nextAt": 1 });

export default mongoose.models.Task || mongoose.model("Task", TaskSchema);
