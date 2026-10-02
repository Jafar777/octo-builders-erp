import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { directKeyFor, serializeConversation, STAFF_FILTER, unreadCount } from "@/lib/messaging";
import { notify } from "@/lib/notify";
import { publish, userChannel } from "@/lib/realtime/server";
import Conversation from "@/models/Conversation";
import User from "@/models/User";

export async function GET() {
  const user = await requireStaff();
  if (!user) return forbidden();

  const conversations = await Conversation.find({ members: user.id })
    .sort({ "lastMessage.at": -1, updatedAt: -1 })
    .limit(200)
    .lean();
  const unread = await Promise.all(conversations.map((c) => unreadCount(c, user.id)));

  return NextResponse.json({
    conversations: conversations.map((c, i) => serializeConversation(c, user.id, unread[i])),
  });
}

// { type: "direct", userId } opens (or reuses) a one-to-one chat.
// { type: "group", name, memberIds } creates a group; the creator is its admin.
export async function POST(request) {
  const user = await requireStaff();
  if (!user) return forbidden();

  const body = await readJson(request);
  const now = new Date();

  if (body.type === "direct") {
    if (!isObjectId(body.userId) || body.userId === user.id) return fail("invalid_request");
    const other = await User.findOne({ _id: body.userId, ...STAFF_FILTER }, { _id: 1 }).lean();
    if (!other) return fail("not_found", 404);

    const directKey = directKeyFor(user.id, body.userId);
    let conversation = await Conversation.findOne({ directKey }).lean();
    if (!conversation) {
      try {
        conversation = (
          await Conversation.create({
            type: "direct",
            directKey,
            members: [user.id, body.userId],
            memberState: [
              { user: user.id, lastReadAt: now },
              { user: body.userId, lastReadAt: now },
            ],
            createdBy: user.id,
          })
        ).toObject();
      } catch {
        // Both people opened the chat at the same moment.
        conversation = await Conversation.findOne({ directKey }).lean();
      }
    }
    return NextResponse.json({ conversation: serializeConversation(conversation, user.id, 0) });
  }

  if (body.type === "group") {
    const name = String(body.name || "").trim().slice(0, 80);
    if (!name) return fail("name_required");
    const requested = (Array.isArray(body.memberIds) ? body.memberIds : []).filter(isObjectId);
    const valid = await User.find({ _id: { $in: requested }, ...STAFF_FILTER }, { _id: 1 }).lean();
    const memberIds = [...new Set([user.id, ...valid.map((u) => u._id.toString())])];
    if (memberIds.length < 2) return fail("members_required");

    const conversation = await Conversation.create({
      type: "group",
      name,
      members: memberIds,
      admins: [user.id],
      memberState: memberIds.map((id) => ({ user: id, lastReadAt: now })),
      createdBy: user.id,
    });

    await publish(
      memberIds.map((id) => userChannel(id)),
      "conversation:updated",
      { conversationId: conversation._id.toString() }
    );
    await notify({
      type: "conversation.added",
      recipients: memberIds,
      actor: user,
      params: { actor: user.name || user.email, conversation: name },
      link: `/dashboard/messages?c=${conversation._id}`,
      entityType: "conversation",
      entityId: conversation._id,
    });

    return NextResponse.json(
      { conversation: serializeConversation(conversation.toObject(), user.id, 0) },
      { status: 201 }
    );
  }

  return fail("invalid_request");
}
