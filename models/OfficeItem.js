import mongoose from "mongoose";
import { ADMIN_REQUEST_TYPES, ITEM_KINDS, ITEM_STATUSES, PRIORITIES } from "@/lib/office";

const { ObjectId } = mongoose.Schema.Types;

// Everything the office tracks until it's closed (lib/office.js): her follow-ups, requests
// to departments, client complaints, operational issues and employees' admin requests.
// Numbered OF-0001…
const UpdateSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["note", "reply", "status", "chase"], default: "note" },
    text: { type: String, default: "" },
    status: { type: String, default: "" }, // the status it moved to (kind "status")
    by: { type: ObjectId, ref: "User" },
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const OfficeItemSchema = new mongoose.Schema(
  {
    number: { type: Number, required: true, unique: true },
    kind: { type: String, enum: ITEM_KINDS, required: true },
    title: { type: String, required: true },
    details: { type: String, default: "" },
    priority: { type: String, enum: PRIORITIES, default: "normal" },
    status: { type: String, enum: ITEM_STATUSES, default: "open" },
    due: { type: Date, default: null },
    // What it's about.
    client: { type: ObjectId, ref: "Client", default: null },
    lead: { type: ObjectId, ref: "Lead", default: null },
    project: { type: ObjectId, ref: "WorkProject", default: null },
    meeting: { type: ObjectId, ref: "Meeting", default: null },
    correspondence: { type: ObjectId, ref: "Correspondence", default: null },
    // Who has to act: a person, or a department (its managers answer).
    assignee: { type: ObjectId, ref: "User", default: null },
    department: { type: ObjectId, ref: "Department", default: null },
    // An employee's admin request: who asked, and for what.
    requester: { type: ObjectId, ref: "User", default: null },
    adminType: { type: String, enum: ["", ...ADMIN_REQUEST_TYPES], default: "" },
    // The real task a department manager made from it (it closes when the task is done).
    task: { type: ObjectId, ref: "Task", default: null },
    updates: [UpdateSchema],
    sentAt: { type: Date, default: null },
    firstResponseAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    closedBy: { type: ObjectId, ref: "User", default: null },
    createdBy: { type: ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

OfficeItemSchema.index({ status: 1, due: 1 });
OfficeItemSchema.index({ assignee: 1, status: 1 });
OfficeItemSchema.index({ department: 1, status: 1 });
OfficeItemSchema.index({ requester: 1, createdAt: -1 });
OfficeItemSchema.index({ client: 1, createdAt: -1 });
OfficeItemSchema.index({ task: 1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.OfficeItem) mongoose.deleteModel("OfficeItem");
export default mongoose.models.OfficeItem || mongoose.model("OfficeItem", OfficeItemSchema);
