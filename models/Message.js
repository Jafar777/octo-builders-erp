import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

const MessageSchema = new mongoose.Schema(
  {
    conversation: { type: ObjectId, ref: "Conversation", required: true },
    sender: { type: ObjectId, ref: "User", default: null }, // null for system messages
    text: { type: String, default: "" },
    attachments: [
      new mongoose.Schema(
        { url: String, name: String, mime: String, size: Number },
        { _id: false }
      ),
    ],
    replyTo: { type: ObjectId, ref: "Message", default: null },
    mentions: [{ type: ObjectId, ref: "User" }],
    system: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    // Deleted messages are hidden from members but kept for management review.
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

MessageSchema.index({ conversation: 1, createdAt: -1 });

export default mongoose.models.Message || mongoose.model("Message", MessageSchema);
