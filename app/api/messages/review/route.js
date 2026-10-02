import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { forbidden, isObjectId } from "@/lib/apiUtils";
import { serializeConversation } from "@/lib/messaging";
import Conversation from "@/models/Conversation";
import User from "@/models/User";

// Conversations management may read (see D9 in plan.txt).
// ?userId=<id> narrows to conversations that person is in.
export async function GET(request) {
  const user = await requirePermission("messages.review");
  if (!user) return forbidden();

  const query = { type: { $in: ["direct", "group", "department"] } };

  if (user.scope !== "all") {
    if (user.scope !== "department" || !user.department) return NextResponse.json({ conversations: [] });
    const deptUsers = await User.find({ department: user.department }, { _id: 1 }).lean();
    query.members = { $in: deptUsers.map((u) => u._id) };
  }

  const userId = new URL(request.url).searchParams.get("userId");
  if (isObjectId(userId)) {
    query.$and = [{ members: userId }];
  }

  const conversations = await Conversation.find(query)
    .sort({ "lastMessage.at": -1, updatedAt: -1 })
    .limit(200)
    .lean();

  return NextResponse.json({
    conversations: conversations
      .filter((c) => c.lastMessage?.at)
      .map((c) => serializeConversation(c, user.id, 0)),
  });
}
