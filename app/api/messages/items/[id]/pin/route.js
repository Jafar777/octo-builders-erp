import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { canPost, serializeMessage } from "@/lib/messaging";
import { conversationChannel, publish } from "@/lib/realtime/server";
import Conversation from "@/models/Conversation";
import Message from "@/models/Message";

const MAX_PINS = 20;

// Pin / unpin a message for everyone in the conversation. Body: { pin: true|false }
export async function POST(request, { params }) {
  const user = await requireStaff({ limited: true });
  if (!user) return forbidden();
  const { id } = await params;
  const message = isObjectId(id) ? await Message.findById(id) : null;
  if (!message || message.deletedAt || message.system) return notFound();
  const conversation = await Conversation.findById(message.conversation);
  if (!conversation || !canPost(user, conversation)) return forbidden();

  const pin = (await readJson(request)).pin !== false;
  const rest = (conversation.pinned || []).filter((p) => p.message.toString() !== id);
  if (pin && rest.length >= MAX_PINS) return fail("too_many_pins");
  conversation.pinned = pin ? [{ message: message._id, by: user.id, at: new Date() }, ...rest] : rest;
  await conversation.save();

  const pinnedIds = conversation.pinned.map((p) => p.message.toString());
  await publish(conversationChannel(conversation._id.toString()), "conversation:pins", { pinned: pinnedIds, message: serializeMessage(message), pin });
  return NextResponse.json({ pinned: pinnedIds });
}
