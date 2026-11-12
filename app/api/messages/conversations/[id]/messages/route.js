import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import {
  canPost,
  conversationAccess,
  MESSAGE_MAX_LENGTH,
  serializeMessage,
  serializeMessageForReview,
} from "@/lib/messaging";
import { notify } from "@/lib/notify";
import { conversationChannel, publish, userChannel } from "@/lib/realtime/server";
import Conversation from "@/models/Conversation";
import Message from "@/models/Message";
import { browseGrants, fileServerReady, gatewaySecret, getFileServer, refsAllowed } from "@/lib/fileServer";
import { cleanRef } from "@/lib/fileServerPaths";

const PAGE_SIZE = 40;

// ?before=<messageId> loads older messages; ?around=<messageId> loads the messages
// around one (search results, pinned). Returned oldest → newest. The first page also
// carries the pinned messages.
export async function GET(request, { params }) {
  const user = await requireStaff({ limited: true });
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const conversation = await Conversation.findById(id).lean();
  if (!conversation) return notFound();
  const access = await conversationAccess(user, conversation);
  if (!access) return forbidden();

  const query = { conversation: id };
  const search = new URL(request.url).searchParams;
  const before = search.get("before");
  const around = search.get("around");
  if (isObjectId(before)) {
    const pivot = await Message.findById(before, { createdAt: 1 }).lean();
    if (pivot) query.createdAt = { $lt: pivot.createdAt };
  }

  let messages;
  let hasNewer = false;
  const pivot = isObjectId(around) ? await Message.findOne({ _id: around, conversation: id }, { createdAt: 1 }).lean() : null;
  if (pivot) {
    const [older, newer] = await Promise.all([
      Message.find({ conversation: id, createdAt: { $lt: pivot.createdAt } }).sort({ createdAt: -1 }).limit(PAGE_SIZE / 2).lean(),
      Message.find({ conversation: id, createdAt: { $gte: pivot.createdAt } }).sort({ createdAt: 1 }).limit(PAGE_SIZE / 2 + 1).lean(),
    ]);
    hasNewer = newer.length > PAGE_SIZE / 2;
    messages = [...newer.slice(0, PAGE_SIZE / 2).reverse(), ...older];
  } else {
    messages = await Message.find(query).sort({ createdAt: -1 }).limit(PAGE_SIZE).lean();
  }

  if (access === "review" && !before) {
    await audit(user, "messages.reviewed", {
      entityType: "conversation",
      entityId: id,
      summary: conversation.name || conversation.type,
    });
  }

  const serialize = access === "review" ? serializeMessageForReview : serializeMessage;
  let pinned;
  if (!before && conversation.pinned?.length) {
    const docs = await Message.find({ _id: { $in: conversation.pinned.map((p) => p.message) }, deletedAt: null }).lean();
    const byId = Object.fromEntries(docs.map((d) => [d._id.toString(), d]));
    pinned = conversation.pinned.map((p) => byId[p.message.toString()]).filter(Boolean).map(serialize);
  }
  return NextResponse.json({
    messages: messages.reverse().map(serialize),
    hasMore: pivot ? true : messages.length === PAGE_SIZE,
    hasNewer,
    pinned: pinned ?? (before ? undefined : []),
    access,
  });
}

// Uploaded files (url), and files / folders shared from the company file server
// (vol + path): only ones the sender can open themselves. → list, or null if not allowed.
async function cleanAttachments(list, user) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const server = [];
  for (const a of list.slice(0, 10)) {
    if (a?.path) {
      const ref = cleanRef(a);
      if (!ref) continue;
      server.push(ref);
      out.push({ url: "", name: ref.name, mime: "", size: ref.size, vol: ref.vol, path: ref.path, dir: ref.dir });
    } else if (typeof a?.url === "string" && /^https?:\/\//.test(a.url)) {
      out.push({ url: a.url, name: String(a.name || "").slice(0, 200), mime: String(a.mime || "").slice(0, 100), size: Number(a.size) || 0 });
    }
  }
  if (server.length) {
    const fs = await getFileServer();
    if (!fileServerReady(fs, await gatewaySecret()) || !refsAllowed(server, browseGrants(user, fs))) return null;
  }
  return out;
}

export async function POST(request, { params }) {
  const user = await requireStaff({ limited: true });
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const conversation = await Conversation.findById(id);
  if (!conversation) return notFound();
  if (!canPost(user, conversation)) return forbidden();

  const body = await readJson(request);
  const text = String(body.text || "").trim().slice(0, MESSAGE_MAX_LENGTH);
  const attachments = await cleanAttachments(body.attachments, user);
  if (attachments === null) return fail("file_not_allowed");
  if (!text && attachments.length === 0) return fail("empty_message");

  const memberIds = conversation.members.map(String);
  const mentions = (Array.isArray(body.mentions) ? body.mentions : []).filter(
    (m) => isObjectId(m) && memberIds.includes(m) && m !== user.id
  );
  const replyTo = isObjectId(body.replyTo) ? body.replyTo : null;

  const message = await Message.create({
    conversation: id,
    sender: user.id,
    text,
    attachments,
    replyTo,
    mentions,
  });

  const preview = text || `📎 ${attachments[0]?.name || ""}`;
  conversation.lastMessage = { text: preview.slice(0, 140), sender: user.id, at: message.createdAt };
  const state = conversation.memberState.find((s) => s.user.toString() === user.id);
  if (state) state.lastReadAt = message.createdAt;
  await conversation.save();

  const payload = serializeMessage(message);
  await publish(conversationChannel(id), "message:new", payload);
  await publish(
    memberIds.map((m) => userChannel(m)),
    "conversation:updated",
    { conversationId: id, lastMessage: { text: conversation.lastMessage.text, senderId: user.id, at: message.createdAt } }
  );

  if (mentions.length) {
    await notify({
      type: "message.mention",
      recipients: mentions,
      actor: user,
      params: {
        actor: user.name || user.email,
        conversation: conversation.name || (conversation.type === "direct" ? "💬" : conversation.type),
      },
      link: `/dashboard/messages?c=${id}`,
      entityType: "message",
      entityId: message._id,
    });
  }

  return NextResponse.json({ message: payload }, { status: 201 });
}
