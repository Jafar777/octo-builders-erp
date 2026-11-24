import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// Two departments (or more) working as one for a while, set by the CEO on the
// Organization page (lib/departmentMerge.js):
//   - one manager heads all of them (added to their User.managedDepartments),
//   - the employees of each can be given the tasks of every one of them.
// Ending the merge (by hand, or when `endsAt` passes) puts everything back.
const DepartmentMergeSchema = new mongoose.Schema(
  {
    departments: [{ type: ObjectId, ref: "Department" }],
    manager: { type: ObjectId, ref: "User", required: true },
    // The departments this merge added to the manager's managedDepartments — exactly
    // what is taken away again when it ends (ones they already headed stay).
    addedManaged: [{ type: ObjectId, ref: "Department" }],
    note: { type: String, default: "" },
    endsAt: { type: Date, default: null }, // null = until ended by hand
    status: { type: String, enum: ["active", "ended"], default: "active" },
    createdBy: { type: ObjectId, ref: "User", default: null },
    endedAt: { type: Date, default: null },
    endedBy: { type: ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

DepartmentMergeSchema.index({ status: 1 });

export default mongoose.models.DepartmentMerge || mongoose.model("DepartmentMerge", DepartmentMergeSchema);
