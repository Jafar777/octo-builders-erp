import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { EDIT_WINDOW_MS, MESSAGE_MAX_LENGTH, serializeMessage } from "@/lib/messaging";
import { conversationChannel, publish } from "@/lib/realtime/server";
import Message from "@/models/Message";

async function loadOwn(params, user) {
  const { id } = await params;
  if (!isObjectId(id)) return { error: notFound() };
  const message = await Message.findById(id);
  if (!message || message.deletedAt) return { error: notFound() };
  if (message.sender?.toString() !== user.id) return { error: forbidden() };
  return { message };
}

// Edit own message text within the edit window.
export async function PATCH(request, { params }) {
  const user = await requireStaff({ limited: true });
  if (!user) return forbidden();
  const { message, error } = await loadOwn(params, user);
  if (error) return error;

  if (Date.now() - message.createdAt.getTime() > EDIT_WINDOW_MS) return fail("edit_window_passed");
  const text = String((await readJson(request)).text || "").trim().slice(0, MESSAGE_MAX_LENGTH);
  if (!text) return fail("empty_message");

  message.text = text;
  message.editedAt = new Date();
  await message.save();

  const payload = serializeMessage(message);
  await publish(conversationChannel(message.conversation.toString()), "message:updated", payload);
  return NextResponse.json({ message: payload });
}

// Delete own message: hidden from members, kept for management review.
export async function DELETE(request, { params }) {
  const user = await requireStaff({ limited: true });
  if (!user) return forbidden();
  const { message, error } = await loadOwn(params, user);
  if (error) return error;

  message.deletedAt = new Date();
  await message.save();

  const payload = serializeMessage(message);
  await publish(conversationChannel(message.conversation.toString()), "message:updated", payload);
  return NextResponse.json({ message: payload });
}
