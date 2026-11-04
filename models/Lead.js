import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

export const LEAD_STAGES = ["new", "contacted", "meeting", "proposal", "won", "lost"];
export const LEAD_SOURCES = ["referral", "website", "social", "walk_in", "repeat", "other"];

// A possible client (Sales page): followed through the stages until won (its accepted
// quotation becomes an intake form) or lost.
const LeadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // the person
    company: { type: String, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    source: { type: String, enum: LEAD_SOURCES, default: "other" },
    stage: { type: String, enum: LEAD_STAGES, default: "new" },
    department: { type: ObjectId, ref: "Department", default: null }, // the kind of work asked for
    need: { type: String, default: "" }, // what they want, in their words
    estimatedValue: { type: Number, default: 0 }, // money people only
    currency: { type: String, default: "" },
    owner: { type: ObjectId, ref: "User", default: null },
    nextAction: { date: { type: String, default: "" }, note: { type: String, default: "" } },
    lostReason: { type: String, default: "" },
    client: { type: ObjectId, ref: "Client", default: null },
    notes: [
      new mongoose.Schema(
        { text: { type: String, required: true }, by: { type: ObjectId, ref: "User" }, at: { type: Date, default: Date.now } },
        { _id: false }
      ),
    ],
    createdBy: { type: ObjectId, ref: "User" },
  },
  { timestamps: true }
);

LeadSchema.index({ stage: 1, updatedAt: -1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.Lead) mongoose.deleteModel("Lead");

export default mongoose.models.Lead || mongoose.model("Lead", LeadSchema);
