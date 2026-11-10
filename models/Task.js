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
    item: { type: ObjectId, default: null }, // former board row (old data only; not used)
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
    // External review: once this task is handed in, another office checks it. For
    // `hours` (working hours, set by the CEO) the tasks waiting for it can't start, but
    // nobody's time is held: the employees work on other projects meanwhile. Marking
    // the review received ends the wait (early or late). See lib/gantt.js readyTime().
    externalReview: {
      hours: { type: Number, default: 0, min: 0 },
      receivedAt: { type: Date, default: null },
      receivedBy: { type: ObjectId, ref: "User", default: null },
    },
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
    // From the project's scale: the working hours the employee has for this task (0 = no limit).
    // The due date follows it (set again when work starts) unless the GM set it by hand.
    maxHours: { type: Number, default: 0 },
    dueManual: { type: Boolean, default: false },
    // Saved plan (Gantt "Save baseline") to compare the current dates with.
    baselineStart: { type: Date, default: null },
    baselineEnd: { type: Date, default: null },
    // Work still going after its due time: when it's now expected to finish. The due
    // date itself stays (lateness counts against it); the plan uses this instead.
    expectedEnd: { type: Date, default: null },
    deliveryLink: { type: String, default: "" },
    attachments: [
      new mongoose.Schema({ url: String, name: String, mime: String, size: Number }, { _id: false }),
    ],
    description: { type: String, default: "" },
    // The steps of the work, ticked off as it goes (progress on the Gantt follows them).
    checklist: [
      new mongoose.Schema({
        text: { type: String, required: true },
        done: { type: Boolean, default: false },
        doneBy: { type: ObjectId, ref: "User", default: null },
        doneAt: { type: Date, default: null },
      }),
    ],
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
    rejectCause: { type: String, enum: ["", "employee", "management", "project", "customer"], default: "" },
    // A redo's reason: the rejectCause of the task it redoes ("" on older redos). KPIs
    // only count redos the employee caused (not management, project or customer ones).
    revisionCause: { type: String, default: "" },
    // Who reviews the handed-in work, in this order: the department manager, then the
    // GM / CEO, then the project's customer (lib/reviewFlow). Set per task when the
    // project is created; a redo keeps the same reviewers.
    review: {
      manager: { type: Boolean, default: true },
      gm: { type: Boolean, default: false },
      customer: { type: Boolean, default: false },
    },
    // The department manager approved it "if the CEO accepts": it now also waits for the
    // CEO's review (lib/reviewFlow.js). Not carried over to a redo.
    ceoApproval: { type: Boolean, default: false },
    // While handed in: the level whose review it waits for ("" on older tasks = manager).
    reviewLevel: { type: String, enum: ["", "manager", "gm", "customer"], default: "" },
    // Every review it got. The summary above (status, stars, ratings, reviewedBy…) is set
    // by the last one: an approval once every level approved, or the rejection.
    reviews: [
      new mongoose.Schema(
        {
          level: { type: String, enum: ["manager", "gm", "customer"], required: true },
          // Levels this review counts for: a GM / CEO stepping in covers the internal ones.
          covers: [{ type: String }],
          by: { type: ObjectId, ref: "User", required: true },
          at: { type: Date, default: Date.now },
          decision: { type: String, enum: ["approve", "reject"], required: true },
          stars: { type: Number, min: 0, max: 5, default: 0 },
          ratings: [{ type: String }],
          notes: { type: String, default: "" },
          rejectCause: { type: String, default: "" },
          // The GM / CEO reviewing in the customer's place.
          onBehalf: { type: Boolean, default: false },
          // The department manager's "accept if the CEO accepts".
          escalated: { type: Boolean, default: false },
        },
        { _id: false }
      ),
    ],

    // The plan before work started, so a start pressed by mistake can be undone.
    startUndo: {
      plannedStart: { type: Date, default: null },
      dueAt: { type: Date, default: null },
    },
    // Cancelling works like an inactive task in MS Project: the task stays on the plan
    // (greyed out, with the time already spent), but no longer takes the employee's time
    // or holds up other work, and the GM / CEO can restore it. Project work is only
    // cancelled by the GM / CEO: the employee asks with a reason (cancelRequest).
    cancelRequest: {
      status: { type: String, enum: ["", "pending", "approved", "rejected"], default: "" },
      by: { type: ObjectId, ref: "User", default: null },
      at: { type: Date, default: null },
      reason: { type: String, default: "" },
      decidedBy: { type: ObjectId, ref: "User", default: null },
      decidedAt: { type: Date, default: null },
      note: { type: String, default: "" },
    },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: ObjectId, ref: "User", default: null },
    cancelReason: { type: String, default: "" },
    // Tasks that waited for it and now wait for its own predecessors instead (linked back on restore).
    cancelRelinked: [{ type: ObjectId, ref: "Task" }],

    dueReminderSent: { type: Boolean, default: false },
    overdueNotified: { type: Boolean, default: false },

    // Imported from the old Excel / Access program (scripts/legacy): the row it came
    // from, so the import can run again without duplicates. Null on tasks made here.
    legacy: {
      type: new mongoose.Schema({ source: String, id: Number }, { _id: false }),
      default: undefined,
    },
  },
  { timestamps: true }
);

TaskSchema.index({ assignee: 1, status: 1 });
TaskSchema.index({ project: 1, item: 1, stage: 1, revision: -1 });
TaskSchema.index({ department: 1, status: 1 });
TaskSchema.index({ parentTask: 1 });
TaskSchema.index({ dependsOn: 1 });
TaskSchema.index({ "recurrence.nextAt": 1 });
TaskSchema.index({ status: 1, reviewLevel: 1 });
TaskSchema.index({ "reviews.by": 1 });
TaskSchema.index({ "legacy.source": 1, "legacy.id": 1 }, { sparse: true });

export default mongoose.models.Task || mongoose.model("Task", TaskSchema);
