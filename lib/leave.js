import User from "@/models/User";
import { NAME_FIELDS, pickName, viewerLang } from "@/lib/personName";

export async function serializeLeaves(list) {
  const ids = [...new Set(list.flatMap((l) => [l.user.toString(), l.decidedBy?.toString()]).filter(Boolean))];
  const users = await User.find({ _id: { $in: ids } }, NAME_FIELDS).lean();
  const lang = await viewerLang();
  const names = Object.fromEntries(users.map((u) => [u._id.toString(), pickName(u, lang)]));
  return list.map((l) => ({
    id: l._id.toString(),
    userId: l.user.toString(),
    userName: names[l.user.toString()] || "—",
    type: l.type,
    from: l.from,
    to: l.to,
    days: l.days,
    reason: l.reason,
    attachmentUrl: l.attachmentUrl,
    status: l.status,
    decidedBy: names[l.decidedBy?.toString()] || null,
    decidedAt: l.decidedAt,
    decisionNote: l.decisionNote,
    createdAt: l.createdAt,
  }));
}
