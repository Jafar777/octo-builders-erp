import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

const ConversationSchema = new mongoose.Schema(
  {
    // direct: two people; group: chosen members; department: everyone in a department;
    // announcement: whole company, only management can post.
    type: { type: String, enum: ["direct", "group", "department", "announcement"], required: true },
    name: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },
    members: [{ type: ObjectId, ref: "User" }],
    admins: [{ type: ObjectId, ref: "User" }],
    department: { type: ObjectId, ref: "Department", default: null },
    directKey: { type: String, default: undefined }, // "<idA>:<idB>" sorted, direct only
    createdBy: { type: ObjectId, ref: "User", default: null },
    lastMessage: {
      text: { type: String, default: "" },
      sender: { type: ObjectId, ref: "User", default: null },
      at: { type: Date, default: null },
    },
    // Pinned messages, newest first (max 20).
    pinned: [
      new mongoose.Schema(
        {
          message: { type: ObjectId, ref: "Message" },
          by: { type: ObjectId, ref: "User" },
          at: { type: Date, default: Date.now },
        },
        { _id: false }
      ),
    ],
    memberState: [
      new mongoose.Schema(
        {
          user: { type: ObjectId, ref: "User" },
          lastReadAt: { type: Date, default: null },
          muted: { type: Boolean, default: false },
        },
        { _id: false }
      ),
    ],
  },
  { timestamps: true }
);

ConversationSchema.index({ members: 1, "lastMessage.at": -1 });
ConversationSchema.index({ directKey: 1 }, { unique: true, sparse: true });
ConversationSchema.index({ type: 1, department: 1 });

export default mongoose.models.Conversation || mongoose.model("Conversation", ConversationSchema);
