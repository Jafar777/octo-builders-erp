import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { conversationAccess, serializeConversation, staffFilter } from "@/lib/messaging";
import { notify } from "@/lib/notify";
import { publish, userChannel } from "@/lib/realtime/server";
import Conversation from "@/models/Conversation";
import User from "@/models/User";

async function load(params) {
  const { id } = await params;
  return isObjectId(id) ? Conversation.findById(id) : null;
}

export async function GET(request, { params }) {
  const user = await requireStaff({ limited: true });
  if (!user) return forbidden();
  const conversation = await load(params);
  if (!conversation) return notFound();
  const access = await conversationAccess(user, conversation);
  if (!access) return forbidden();

  return NextResponse.json({
    conversation: serializeConversation(conversation.toObject(), user.id, 0),
    access,
  });
}

// Group management: { name }, { addMemberIds }, { removeMemberId } (admins; anyone may
// remove themselves = leave). Any member: { muted }.
export async function PATCH(request, { params }) {
  const user = await requireStaff({ limited: true });
  if (!user) return forbidden();
  const conversation = await load(params);
  if (!conversation) return notFound();
  if (!conversation.members.some((m) => m.toString() === user.id)) return forbidden();

  const body = await readJson(request);
  const isAdmin = conversation.admins.some((a) => a.toString() === user.id);
  const before = conversation.members.map(String);

  if (typeof body.muted === "boolean") {
    const state = conversation.memberState.find((s) => s.user.toString() === user.id);
    if (state) state.muted = body.muted;
  }

  if (conversation.type === "group") {
    if (typeof body.name === "string" && isAdmin) {
      const name = body.name.trim().slice(0, 80);
      if (name) conversation.name = name;
    }

    if (Array.isArray(body.addMemberIds) && isAdmin) {
      const valid = await User.find(
        { _id: { $in: body.addMemberIds.filter(isObjectId) }, ...(await staffFilter()) },
        { _id: 1 }
      ).lean();
      for (const u of valid) {
        const id = u._id.toString();
        if (!before.includes(id)) {
          conversation.members.push(id);
          conversation.memberState.push({ user: id, lastReadAt: new Date() });
        }
      }
    }

    if (isObjectId(body.removeMemberId) && (isAdmin || body.removeMemberId === user.id)) {
      conversation.members = conversation.members.filter((m) => m.toString() !== body.removeMemberId);
      conversation.admins = conversation.admins.filter((m) => m.toString() !== body.removeMemberId);
      conversation.memberState = conversation.memberState.filter(
        (s) => s.user.toString() !== body.removeMemberId
      );
      // A group never ends up without an admin.
      if (conversation.admins.length === 0 && conversation.members.length > 0) {
        conversation.admins = [conversation.members[0]];
      }
    }
  } else if (body.name || body.addMemberIds || body.removeMemberId) {
    return fail("not_a_group");
  }

  await conversation.save();

  const after = conversation.members.map(String);
  const added = after.filter((id) => !before.includes(id));
  await publish(
    [...new Set([...before, ...after])].map((id) => userChannel(id)),
    "conversation:updated",
    { conversationId: conversation._id.toString() }
  );
  if (added.length) {
    await notify({
      type: "conversation.added",
      recipients: added,
      actor: user,
      params: { actor: user.name || user.email, conversation: conversation.name },
      link: `/dashboard/messages?c=${conversation._id}`,
      entityType: "conversation",
      entityId: conversation._id,
    });
  }

  return NextResponse.json({ conversation: serializeConversation(conversation.toObject(), user.id, 0) });
}
