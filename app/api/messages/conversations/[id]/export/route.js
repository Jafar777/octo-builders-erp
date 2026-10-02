import { requireStaff } from "@/lib/currentUser";
import { forbidden, isObjectId, notFound } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { conversationAccess } from "@/lib/messaging";
import Conversation from "@/models/Conversation";
import Message from "@/models/Message";
import User from "@/models/User";

const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

// Whole conversation as a CSV file (opens in Excel, Arabic included). Members and
// management with review access; every export is audited.
export async function GET(request, { params }) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const { id } = await params;
  const conversation = isObjectId(id) ? await Conversation.findById(id).lean() : null;
  if (!conversation) return notFound();
  const access = await conversationAccess(user, conversation);
  if (!access) return forbidden();

  const messages = await Message.find({ conversation: id }).sort({ createdAt: 1 }).lean();
  const senderIds = [...new Set(messages.map((m) => m.sender?.toString()).filter(Boolean))];
  const people = await User.find({ _id: { $in: senderIds } }, { name: 1, email: 1 }).lean();
  const names = Object.fromEntries(people.map((p) => [p._id.toString(), p.name || p.email]));
  // Members don't see deleted text; management review does (marked as deleted).
  const showDeleted = access === "review";

  const rows = [["date", "time", "sender", "message", "attachments", "edited", "deleted"]];
  for (const m of messages) {
    if (m.deletedAt && !showDeleted) continue;
    const at = new Date(m.createdAt).toISOString();
    rows.push([
      at.slice(0, 10),
      at.slice(11, 19),
      m.system ? "system" : names[m.sender?.toString()] || "—",
      m.text,
      (m.attachments || []).map((a) => a.url).join(" "),
      m.editedAt ? "yes" : "",
      m.deletedAt ? "yes" : "",
    ]);
  }
  await audit(user, "messages.exported", { entityType: "conversation", entityId: id, summary: conversation.name || conversation.type });

  const csv = "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
  const filename = `conversation-${(conversation.name || conversation.type).replace(/[^\w-]+/g, "_")}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
