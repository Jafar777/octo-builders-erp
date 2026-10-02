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
    startDate: { type: Date, default: null },
    dueDate: { type: Date, required: true }, // mandatory — most Excel projects had none
    baselineDueDate: { type: Date, default: null },
    folderLink: { type: String, default: "" },
    notes: { type: String, default: "" },
    // Board: rows = items (spaces / drawings / the building), columns = stages.
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
          item: { type: ObjectId, required: true },
          stage: { type: String, required: true },
          status: { type: String, enum: ["skip", "done"], required: true },
          reason: { type: String, default: "" },
          by: { type: ObjectId, ref: "User" },
          at: { type: Date, default: Date.now },
        },
        { _id: false }
      ),
    ],
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
