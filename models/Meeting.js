import mongoose from "mongoose";
import { MEETING_KINDS, MEETING_STATUSES } from "@/lib/office";

const { ObjectId } = mongoose.Schema.Types;

// A meeting the office organises (internal or with a client): when, where, who, the
// agenda, the minutes and the decisions — each decision can become a tracked office item.
const MeetingSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: MEETING_KINDS, default: "internal" },
    title: { type: String, required: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    place: { type: String, default: "" }, // a room, an address or an online link
    participants: [{ type: ObjectId, ref: "User" }],
    guests: { type: String, default: "" }, // people from outside, by name
    client: { type: ObjectId, ref: "Client", default: null },
    project: { type: ObjectId, ref: "WorkProject", default: null },
    agenda: { type: String, default: "" },
    minutes: { type: String, default: "" },
    minutesAt: { type: Date, default: null },
    decisions: [
      new mongoose.Schema(
        {
          text: { type: String, required: true },
          owner: { type: ObjectId, ref: "User", default: null },
          due: { type: Date, default: null },
          item: { type: ObjectId, ref: "OfficeItem", default: null },
        },
        { _id: true }
      ),
    ],
    status: { type: String, enum: MEETING_STATUSES, default: "scheduled" },
    organizer: { type: ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

MeetingSchema.index({ start: 1 });
MeetingSchema.index({ participants: 1, start: 1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.Meeting) mongoose.deleteModel("Meeting");
export default mongoose.models.Meeting || mongoose.model("Meeting", MeetingSchema);
