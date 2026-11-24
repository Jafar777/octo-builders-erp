// The change log between the CEO and the programmer (models/ChangeTicket.js).
//   - The CEO asks for changes from any page (the orange line on top), and follows them
//     on System → Change log.
//   - The programmer (the hidden "coder" role) takes requests on, answers them, and logs
//     changes of their own. The CEO is told of every answer and every logged change.
import User from "@/models/User";
import { NAME_FIELDS, pickName, viewerLang } from "@/lib/personName";

const idStr = (v) => (v ? v.toString() : null);

// The CEO: signed in as themselves, viewing the dashboard as someone else (the request
// is theirs, seen from that person's view), or the programmer viewing as the CEO.
export const isCeo = (user) => Boolean(user?.isStaff && (user.role === "ceo" || user.actingAs?.role === "ceo"));
// Who asks (the real CEO when they view as someone), and whose view they had, if any.
export function requester(user) {
  if (user.actingAs?.role === "ceo") return { id: user.actingAs.id, viewAs: { id: user.id, name: user.displayName || user.name || user.email, role: user.role } };
  return { id: user.id, viewAs: null };
}
export const isProgrammer = (user) => Boolean(user?.isStaff && user.role === "coder" && !user.actingAs);
export const canSeeChangeLog = (user) => isCeo(user) || isProgrammer(user);

const clip = (v, n) => String(v || "").trim().slice(0, n);

// { type, title, summary, page: { path, key, label, tab } } from a request body.
export function cleanTicket(body) {
  const summary = clip(body.summary, 4000);
  if (!summary) return { error: "change_summary_required" };
  return {
    value: {
      type: body.type === "feature" ? "feature" : "bug",
      title: clip(body.title, 200),
      summary,
      page: {
        path: clip(body.page?.path, 300),
        key: clip(body.page?.key, 40),
        label: clip(body.page?.label, 120),
        tab: clip(body.page?.tab, 120),
      },
    },
  };
}

// The people who get told: the CEOs, or the programmers.
export async function ceoIds() {
  return (await User.find({ role: "ceo", status: "active" }, { _id: 1 }).lean()).map((u) => idStr(u._id));
}
export async function programmerIds() {
  return (await User.find({ role: "coder", status: "active" }, { _id: 1 }).lean()).map((u) => idStr(u._id));
}

export const ticketCode = (t) => (t.kind === "log" ? `L-${t.number}` : `#${t.number}`);

export async function serializeTickets(list) {
  const ids = [...new Set(list.flatMap((t) => [t.requestedBy, t.acceptedBy, t.fix?.by, ...(t.replies || []).map((r) => r.by)].map(idStr)).filter(Boolean))];
  const people = await User.find({ _id: { $in: ids } }, NAME_FIELDS).lean();
  const lang = await viewerLang();
  const name = Object.fromEntries(people.map((p) => [idStr(p._id), pickName(p, lang)]));
  return list.map((t) => ({
    id: idStr(t._id),
    kind: t.kind,
    number: t.number,
    code: ticketCode(t),
    type: t.type,
    title: t.title || "",
    summary: t.summary,
    page: { path: t.page?.path || "", key: t.page?.key || "", label: t.page?.label || "", tab: t.page?.tab || "" },
    viewAs: t.viewAs?.id ? { name: t.viewAs.name || "", role: t.viewAs.role || "" } : null,
    status: t.status,
    requestedBy: name[idStr(t.requestedBy)] || null,
    acceptedBy: name[idStr(t.acceptedBy)] || null,
    acceptedAt: t.acceptedAt || null,
    fix: t.fix?.at ? { how: t.fix.how || "", changes: t.fix.changes || "", by: name[idStr(t.fix.by)] || null, at: t.fix.at } : null,
    declineNote: t.declineNote || "",
    replies: (t.replies || []).map((r) => ({ id: idStr(r._id), from: r.from, by: name[idStr(r.by)] || null, text: r.text, at: r.at })),
    // Who the conversation waits for: the last word was the other side's.
    waitingFor: (() => {
      const last = (t.replies || []).at(-1);
      if (!last || !["open", "accepted"].includes(t.status)) return null;
      return last.from === "programmer" ? "ceo" : "programmer";
    })(),
    declinedAt: t.declinedAt || null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }));
}
