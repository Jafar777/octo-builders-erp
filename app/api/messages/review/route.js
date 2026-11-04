import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { forbidden, isObjectId } from "@/lib/apiUtils";
import { messageReviewScope, serializeConversation } from "@/lib/messaging";
import Conversation from "@/models/Conversation";
import User from "@/models/User";
import { inDepartments } from "@/lib/scope";

// Conversations management may read, on the Messages page's review view: the CEO
// everyone's, a department manager their departments' (lib/messaging messageReviewScope).
// ?userId=<id> narrows to conversations that person is in.
export async function GET(request) {
  const user = await requireStaff();
  const scope = messageReviewScope(user);
  if (!scope) return forbidden();

  const query = { type: { $in: ["direct", "group", "department"] } };

  if (scope === "department") {
    const deptUsers = await User.find(inDepartments(user), { _id: 1 }).lean();
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
