import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { forbidden, isObjectId, notFound } from "@/lib/apiUtils";
import { conversationChannel, publish, userChannel } from "@/lib/realtime/server";
import Conversation from "@/models/Conversation";

export async function POST(request, { params }) {
  const user = await requireStaff({ limited: true });
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();

  const lastReadAt = new Date();
  const result = await Conversation.updateOne(
    { _id: id, "memberState.user": user.id },
    { $set: { "memberState.$.lastReadAt": lastReadAt } }
  );
  if (result.matchedCount === 0) return forbidden();

  // Read receipts for the chat, and badge refresh for the user's other tabs.
  await publish(conversationChannel(id), "conversation:read", { userId: user.id, lastReadAt });
  await publish(userChannel(user.id), "conversation:updated", { conversationId: id, read: true });

  return NextResponse.json({ ok: true, lastReadAt });
}
