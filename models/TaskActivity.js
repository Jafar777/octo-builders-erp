import mongoose from "mongoose";

// Timeline of a task: every status change and every comment.
const TaskActivitySchema = new mongoose.Schema(
  {
    task: { type: mongoose.Schema.Types.ObjectId, ref: "Task", required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    type: { type: String, required: true }, // created, started, paused, ..., comment
    text: { type: String, default: "" },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

TaskActivitySchema.index({ task: 1, createdAt: 1 });

export default mongoose.models.TaskActivity || mongoose.model("TaskActivity", TaskActivitySchema);
