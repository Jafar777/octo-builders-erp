import mongoose from "mongoose";
import Conversation from "@/models/Conversation";
import Message, { MESSAGE_TTL_SECONDS } from "@/models/Message";
import User from "@/models/User";
import Department from "@/models/Department";
import Role from "@/models/Role";
import { DEFAULT_ROLE } from "@/lib/permissions";
import { hasPermission } from "@/lib/currentUser";
import { publish, userChannel } from "@/lib/realtime/server";
import { getImageKit } from "@/lib/imagekit";
import { CHAT_UPLOAD_FOLDER } from "@/lib/uploadFile";

export const MESSAGE_MAX_LENGTH = 4000;
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

const idStr = (v) => (v ? v.toString() : null);

// Active employees with a real role — the people who take part in messaging.
export const STAFF_FILTER = { status: "active", role: { $ne: DEFAULT_ROLE } };

export function directKeyFor(a, b) {
  return [String(a), String(b)].sort().join(":");
}

// "member", "review" (management reading someone else's chat) or null.
export async function conversationAccess(user, conversation) {
  if (!user?.isStaff || !conversation) return null;
  if (conversation.members.some((m) => idStr(m) === user.id)) return "member";
  if (!hasPermission(user, "messages.review")) return null;
  if (user.scope === "all") return "review";
  if (user.scope === "department" && user.department) {
    const inDepartment = await User.countDocuments({
      _id: { $in: conversation.members },
      department: user.department,
    });
    return inDepartment > 0 ? "review" : null;
  }
  return null;
}

export function canPost(user, conversation) {
  if (conversation.type === "announcement") return hasPermission(user, "messages.announce");
  return conversation.members.some((m) => idStr(m) === user.id);
}

export function serializeMessage(m) {
  const deleted = Boolean(m.deletedAt);
  return {
    id: m._id.toString(),
    conversationId: idStr(m.conversation),
    senderId: idStr(m.sender),
    text: deleted ? "" : m.text,
    attachments: deleted ? [] : m.attachments || [],
    replyTo: idStr(m.replyTo),
    mentions: (m.mentions || []).map(idStr),
    system: m.system,
    editedAt: m.editedAt,
    deleted,
    createdAt: m.createdAt,
  };
}

// For management review: deleted content stays visible, marked as deleted.
export function serializeMessageForReview(m) {
  return { ...serializeMessage(m), text: m.text, attachments: m.attachments || [] };
}

export function serializeConversation(c, meId, unread = 0) {
  const state = (c.memberState || []).find((s) => idStr(s.user) === meId);
  return {
    id: c._id.toString(),
    type: c.type,
    name: c.name,
    avatarUrl: c.avatarUrl,
    members: c.members.map(idStr),
    admins: (c.admins || []).map(idStr),
    department: idStr(c.department),
    // The preview of an expired (already removed) message is not shown.
    lastMessage: c.lastMessage?.at && Date.now() - new Date(c.lastMessage.at).getTime() < MESSAGE_TTL_SECONDS * 1000
      ? { text: c.lastMessage.text, senderId: idStr(c.lastMessage.sender), at: c.lastMessage.at }
      : null,
    readStates: (c.memberState || []).map((s) => ({ userId: idStr(s.user), lastReadAt: s.lastReadAt })),
    muted: Boolean(state?.muted),
    unread,
    updatedAt: c.updatedAt,
  };
}

export async function unreadCount(conversation, meId) {
  const state = (conversation.memberState || []).find((s) => idStr(s.user) === meId);
  const query = {
    conversation: conversation._id,
    sender: { $ne: new mongoose.Types.ObjectId(meId) },
    deletedAt: null,
  };
  if (state?.lastReadAt) query.createdAt = { $gt: state.lastReadAt };
  return Message.countDocuments(query);
}

export async function totalUnread(meId) {
  const conversations = await Conversation.find({ members: meId }, { memberState: 1 }).lean();
  const counts = await Promise.all(conversations.map((c) => unreadCount(c, meId)));
  return counts.reduce((a, b) => a + b, 0);
}

// Keeps a channel's member list equal to `memberIds`, preserving read state.
async function syncMembers(conversation, memberIds) {
  const ids = memberIds.map(String);
  const current = conversation.members.map(String);
  const changed = ids.length !== current.length || ids.some((id) => !current.includes(id));
  if (!changed) return false;

  const states = new Map((conversation.memberState || []).map((s) => [String(s.user), s]));
  conversation.members = ids;
  conversation.memberState = ids.map((id) => states.get(id) || { user: id, lastReadAt: new Date() });
  await conversation.save();
  return true;
}

// Department and company channels follow the staff list automatically.
export async function syncStaffChannels() {
  const staff = await User.find(STAFF_FILTER, { _id: 1, department: 1 }).lean();
  const touched = [];

  let company = await Conversation.findOne({ type: "announcement" });
  if (!company) {
    company = new Conversation({ type: "announcement", name: "OCTO", members: [], memberState: [] });
  }
  if (await syncMembers(company, staff.map((u) => u._id))) touched.push(company);

  const departments = await Department.find({ active: true }).lean();
  for (const dep of departments) {
    const members = staff.filter((u) => idStr(u.department) === dep._id.toString()).map((u) => u._id);
    let channel = await Conversation.findOne({ type: "department", department: dep._id });
    if (!channel) {
      if (members.length === 0) continue;
      channel = new Conversation({ type: "department", department: dep._id, members: [], memberState: [] });
    }
    if (await syncMembers(channel, members)) touched.push(channel);
  }

  // Let everyone affected refresh their conversation list.
  await Promise.all(
    touched.map((c) =>
      publish(
        c.members.map((m) => userChannel(m.toString())),
        "conversation:updated",
        { conversationId: c._id.toString() }
      )
    )
  );
}

// Daily clean-up of everything older than the 24-hour message lifetime: messages
// (also removed by the TTL index in models/Message.js), their pins and previews, and
// the files uploaded to the chat folder on ImageKit.
export async function purgeExpiredMessages(now = new Date()) {
  const cutoff = new Date(now.getTime() - MESSAGE_TTL_SECONDS * 1000);
  const { deletedCount } = await Message.deleteMany({ createdAt: { $lt: cutoff } });

  await Conversation.updateMany(
    { "lastMessage.at": { $lt: cutoff } },
    { $set: { lastMessage: { text: "", sender: null, at: null } } }
  );
  // An ObjectId starts with its creation time, so older ids are expired messages.
  const cutoffId = mongoose.Types.ObjectId.createFromTime(Math.floor(cutoff.getTime() / 1000));
  await Conversation.updateMany({ "pinned.0": { $exists: true } }, { $pull: { pinned: { message: { $lt: cutoffId } } } });

  // Files, oldest first, 100 at a time (ImageKit's bulk-delete limit). The hour of
  // grace keeps a file that was uploaded a while before its message was sent.
  const fileCutoff = cutoff.getTime() - 60 * 60 * 1000;
  const imagekit = getImageKit();
  let files = 0;
  for (let round = 0; round < 50; round += 1) {
    const page = await imagekit.listFiles({ path: CHAT_UPLOAD_FOLDER, sort: "ASC_CREATED", limit: 100 });
    const expired = page.filter(
      (f) =>
        f.type === "file" &&
        f.filePath?.startsWith(`${CHAT_UPLOAD_FOLDER}/`) &&
        new Date(f.createdAt).getTime() < fileCutoff
    );
    if (expired.length === 0) break;
    await imagekit.bulkDeleteFiles(expired.map((f) => f.fileId));
    files += expired.length;
    if (expired.length < page.length) break;
  }

  return { messages: deletedCount, files };
}

// Roles allowed to post in the company announcement channel, for display.
export async function announcerRoleKeys() {
  const roles = await Role.find({ permissions: "messages.announce" }, { key: 1 }).lean();
  return roles.map((r) => r.key);
}
