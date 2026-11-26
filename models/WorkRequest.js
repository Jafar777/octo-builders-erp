import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// What an employee asks before starting work (lib/hybridServer.js):
//   transfer  take over a task planned for a colleague
//   fixed     start work that runs into a task the CEO fixed in place (the CEO decides)
//   stage     start a stage that waits for earlier ones
//   hours     more hours than the limit, for work already started
//   client    the client asked to change approved work (the manager opens a client change)
//   start     new work the employee wants to do: the stage's department manager gives
//             its hours first (or the CEO); `urgent` puts it before their planned work and
//             pauses the task they're on (`pauseTask`) in the same approval
//   pause     pause the task they're on (`task`): their manager or the CEO approves first
export const WORK_REQUEST_KINDS = ["transfer", "fixed", "stage", "hours", "client", "start", "pause"];

const WorkRequestSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: WORK_REQUEST_KINDS, required: true },
    by: { type: ObjectId, ref: "User", required: true },
    department: { type: ObjectId, ref: "Department", default: null }, // the employee's
    task: { type: ObjectId, ref: "Task", default: null }, // the task it's about
    project: { type: ObjectId, ref: "WorkProject", default: null },
    stage: { type: String, default: "" },
    title: { type: String, default: "" },
    item: { type: mongoose.Schema.Types.ObjectId, default: null }, // the project row (space / sheet)
    type: { type: String, default: "" },
    hours: { type: Number, default: 0 },
    again: { type: String, default: "" },
    reason: { type: String, default: "" },
    // "start": the department of the stage (its manager decides), the work comes before
    // the plan, the task it pauses, and whether it runs into tasks the CEO fixed.
    stageDepartment: { type: ObjectId, ref: "Department", default: null },
    urgent: { type: Boolean, default: false },
    pauseTask: { type: ObjectId, ref: "Task", default: null },
    fixedHit: { type: Boolean, default: false },
    // What carrying it out did to the CEO's plan (the CEO's "plan interrupted" list).
    interrupted: {
      paused: { type: Number, default: null }, // the task number paused
      pushed: { type: [Number], default: [] }, // planned tasks moved later
    },
    status: { type: String, enum: ["pending", "approved", "declined", "cancelled"], default: "pending" },
    decidedBy: { type: ObjectId, ref: "User", default: null },
    decidedAt: { type: Date, default: null },
    note: { type: String, default: "" },
    created: { type: ObjectId, ref: "Task", default: null }, // the task it made
    // One open request per person and piece of work (unset once decided).
    lock: { type: String },
  },
  { timestamps: true }
);

WorkRequestSchema.index({ status: 1, department: 1 });
WorkRequestSchema.index({ by: 1, createdAt: -1 });
WorkRequestSchema.index({ status: 1, kind: 1, stageDepartment: 1 });
WorkRequestSchema.index({ lock: 1 }, { unique: true, sparse: true });

export default mongoose.models.WorkRequest || mongoose.model("WorkRequest", WorkRequestSchema);
