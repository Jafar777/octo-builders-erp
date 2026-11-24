import mongoose from "mongoose";
import { CHANNELS } from "@/lib/office";

const { ObjectId } = mongoose.Schema.Types;

// A call, message, email or visit the office logged (lib/office.js): who with, what about,
// what came of it, and whether a call has to be returned.
const InteractionSchema = new mongoose.Schema(
  {
    channel: { type: String, enum: CHANNELS, default: "call_in" },
    summary: { type: String, required: true },
    outcome: { type: String, default: "" },
    client: { type: ObjectId, ref: "Client", default: null },
    lead: { type: ObjectId, ref: "Lead", default: null },
    project: { type: ObjectId, ref: "WorkProject", default: null },
    person: { type: ObjectId, ref: "User", default: null }, // an employee it was with / about
    contactName: { type: String, default: "" }, // who called, when not a saved client
    contactPhone: { type: String, default: "" },
    // A call to return: done when callbackDoneAt is set.
    callback: { type: Boolean, default: false },
    callbackDoneAt: { type: Date, default: null },
    item: { type: ObjectId, ref: "OfficeItem", default: null }, // the follow-up it started
    at: { type: Date, default: Date.now },
    by: { type: ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

InteractionSchema.index({ at: -1 });
InteractionSchema.index({ client: 1, at: -1 });
InteractionSchema.index({ lead: 1, at: 1 });
InteractionSchema.index({ callback: 1, callbackDoneAt: 1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.Interaction) mongoose.deleteModel("Interaction");
export default mongoose.models.Interaction || mongoose.model("Interaction", InteractionSchema);
