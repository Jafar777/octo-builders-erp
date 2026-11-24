import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// A change the client asked for after work was approved (lib/clientChangeServer.js): what,
// when, which tasks it touched and what it cost in hours and time. Kept for good.
//   pending  → a department manager asked; the CEO decides
//   applying → being carried out right now (a lock)
//   applied / declined
export const BILLING = ["", "free", "paid"]; // "" = the CEO hasn't decided

const ClientChangeSchema = new mongoose.Schema(
  {
    number: { type: Number, required: true, unique: true },
    status: { type: String, enum: ["pending", "applying", "applied", "declined"], required: true },
    // The task being changed, while the change is open: two can't run on it at once.
    lock: { type: String, default: undefined },
    project: { type: ObjectId, ref: "WorkProject", default: null },
    task: { type: ObjectId, ref: "Task", required: true },
    summary: { type: String, required: true },
    billing: { type: String, enum: BILLING, default: "" },
    requestedBy: { type: ObjectId, ref: "User", required: true },
    decidedBy: { type: ObjectId, ref: "User", default: null },
    decidedAt: { type: Date, default: null },
    declineReason: { type: String, default: "" },
    items: [
      new mongoose.Schema(
        {
          task: { type: ObjectId, ref: "Task" },
          number: Number,
          status: String, // the task's status when the change was made
          action: String,
          hours: { type: Number, default: 0 },
          newTask: { type: ObjectId, ref: "Task", default: null },
          newNumber: { type: Number, default: null },
        },
        { _id: false }
      ),
    ],
    extraHours: { type: Number, default: 0 },
    deliveryFrom: { type: Date, default: null },
    deliveryTo: { type: Date, default: null },
  },
  { timestamps: true }
);

ClientChangeSchema.index({ lock: 1 }, { unique: true, sparse: true });
ClientChangeSchema.index({ project: 1, createdAt: -1 });
ClientChangeSchema.index({ status: 1 });

export default mongoose.models.ClientChange || mongoose.model("ClientChange", ClientChangeSchema);
