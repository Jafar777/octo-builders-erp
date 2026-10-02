import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { forbidden, isObjectId, notFound } from "@/lib/apiUtils";
import { conversationChannel, publish } from "@/lib/realtime/server";
import Conversation from "@/models/Conversation";

// The client calls this at most every few seconds while the user is typing.
export async function POST(request, { params }) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();

  const isMember = await Conversation.exists({ _id: id, members: user.id });
  if (!isMember) return forbidden();

  await publish(conversationChannel(id), "typing", { userId: user.id });
  return NextResponse.json({ ok: true });
}
