import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { forbidden, isObjectId } from "@/lib/apiUtils";
import { serializeMessage } from "@/lib/messaging";
import Conversation from "@/models/Conversation";
import Message from "@/models/Message";

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Search my own conversations (members only — management review has its own screen).
// ?q=<text>  &c=<conversationId> to search inside one conversation.
export async function GET(request) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") || "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ results: [] });

  const mine = await Conversation.find({ members: user.id }, { _id: 1 }).lean();
  let ids = mine.map((c) => c._id);
  const only = params.get("c");
  if (isObjectId(only)) ids = ids.filter((id) => id.toString() === only);

  const messages = await Message.find({
    conversation: { $in: ids },
    deletedAt: null,
    system: { $ne: true },
    $or: [{ text: { $regex: escape(q), $options: "i" } }, { "attachments.name": { $regex: escape(q), $options: "i" } }],
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  return NextResponse.json({ results: messages.map(serializeMessage) });
}
