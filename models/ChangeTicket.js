import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// The change log (System page → Change log, lib/changeLog.js):
//   kind "request" — the CEO asks the programmer for a fix or a feature from any page
//                    ("Request a change from the programmer"). Numbered #1, #2… so the
//                    count shows how many changes the CEO asked for.
//   kind "log"     — a change the programmer made on their own (numbered L-1, L-2…).
// A request goes open → accepted (the programmer took it on) → done (how it was fixed
// and what changed; the CEO is told), or declined (with the reason).
export const CHANGE_KINDS = ["request", "log"];
export const CHANGE_TYPES = ["bug", "feature"];
// "withdrawn": the CEO took the request back before it was taken on (the number stays).
export const CHANGE_STATUSES = ["open", "accepted", "done", "declined", "withdrawn"];

const ChangeTicketSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: CHANGE_KINDS, required: true },
    number: { type: Number, required: true },
    type: { type: String, enum: CHANGE_TYPES, default: "bug" },
    title: { type: String, default: "" },
    summary: { type: String, required: true },
    // Pictures of the problem (screenshots), in the private uploads folder "changes".
    images: [{ url: { type: String, required: true }, name: { type: String, default: "" } }],
    // Where the CEO was when they asked: the page's path, its key (lib/permissions.js
    // PAGES), and the page / tab names as shown on screen.
    page: {
      path: { type: String, default: "" },
      key: { type: String, default: "" },
      label: { type: String, default: "" },
      tab: { type: String, default: "" },
    },
    // The CEO was viewing the dashboard as this person when they asked ("View as"): the
    // page as that person sees it.
    viewAs: {
      id: { type: ObjectId, ref: "User", default: null },
      name: { type: String, default: "" },
      role: { type: String, default: "" },
    },
    status: { type: String, enum: CHANGE_STATUSES, default: "open" },
    requestedBy: { type: ObjectId, ref: "User", default: null },
    acceptedBy: { type: ObjectId, ref: "User", default: null },
    acceptedAt: { type: Date, default: null },
    // The programmer's answer: how it was fixed, and what changed for the users.
    fix: {
      how: { type: String, default: "" },
      changes: { type: String, default: "" },
      by: { type: ObjectId, ref: "User", default: null },
      at: { type: Date, default: null },
    },
    declineNote: { type: String, default: "" },
    // The conversation about a request before (or after) it's answered: the programmer
    // asks a question or comments, the CEO answers. `from`: "programmer" | "ceo".
    replies: [
      {
        from: { type: String, enum: ["programmer", "ceo"], required: true },
        by: { type: ObjectId, ref: "User", default: null },
        text: { type: String, required: true },
        at: { type: Date, default: Date.now },
      },
    ],
    declinedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ChangeTicketSchema.index({ kind: 1, number: 1 }, { unique: true });
ChangeTicketSchema.index({ status: 1, createdAt: -1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.ChangeTicket) mongoose.deleteModel("ChangeTicket");

export default mongoose.models.ChangeTicket || mongoose.model("ChangeTicket", ChangeTicketSchema);
