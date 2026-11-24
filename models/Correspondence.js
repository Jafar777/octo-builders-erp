import mongoose from "mongoose";
import { CORRESPONDENCE_CHANNELS } from "@/lib/office";

const { ObjectId } = mongoose.Schema.Types;

// The office's register of incoming and outgoing files and letters (IN-2026-0001 /
// OUT-2026-0001): what, with whom, how, when, the file itself (private upload) or its
// link (Google Drive…), and who received it.
const CorrespondenceSchema = new mongoose.Schema(
  {
    direction: { type: String, enum: ["in", "out"], required: true },
    ref: { type: String, required: true, unique: true },
    subject: { type: String, required: true },
    counterparty: { type: String, default: "" }, // the sender / the recipient
    channel: { type: String, enum: CORRESPONDENCE_CHANNELS, default: "email" },
    date: { type: String, required: true }, // YYYY-MM-DD
    notes: { type: String, default: "" },
    attachments: [new mongoose.Schema({ name: String, url: String, size: Number, mime: String }, { _id: false })],
    links: [{ type: String }],
    client: { type: ObjectId, ref: "Client", default: null },
    project: { type: ObjectId, ref: "WorkProject", default: null },
    // Delivery: who got it and when (outgoing), or who it was passed to (incoming).
    deliveredTo: { type: String, default: "" },
    receivedAt: { type: Date, default: null },
    createdBy: { type: ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

CorrespondenceSchema.index({ date: -1 });
CorrespondenceSchema.index({ client: 1, date: -1 });
CorrespondenceSchema.index({ project: 1, date: -1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.Correspondence) mongoose.deleteModel("Correspondence");
export default mongoose.models.Correspondence || mongoose.model("Correspondence", CorrespondenceSchema);
