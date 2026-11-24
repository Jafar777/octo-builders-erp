import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { ceoIds, isCeo, isProgrammer, programmerIds, requester, serializeTickets, ticketCode } from "@/lib/changeLog";
import ChangeTicket from "@/models/ChangeTicket";

const LINK = "/dashboard/system?tab=changes";
const clip = (v, n) => String(v || "").trim().slice(0, n);

// The programmer: { action: "accept" } | { action: "done", how, changes } |
// { action: "decline", note } on a request; { action: "edit", title, summary, how } on
// their own logged change. The CEO and the person told learn each answer.
// Both: { action: "reply", text } on a request — a question or a comment (the programmer)
// and its answer (the CEO); the other side is told.
export async function PATCH(request, { params }) {
  const user = await getCurrentUser();
  const programmer = isProgrammer(user);
  const ceo = !programmer && isCeo(user);
  if (!programmer && !ceo) return forbidden();
  const { id } = await params;
  const ticket = isObjectId(id) ? await ChangeTicket.findById(id) : null;
  if (!ticket) return notFound();
  const body = await readJson(request);
  const now = new Date();
  const code = ticketCode(ticket);
  const label = ticket.title || ticket.summary.slice(0, 80);

  if (body.action === "reply") {
    if (ticket.kind !== "request" || ticket.status === "withdrawn") return fail("invalid_request");
    const text = clip(body.text, 4000);
    if (!text) return fail("change_reply_required");
    ticket.replies.push({ from: programmer ? "programmer" : "ceo", by: programmer ? user.id : requester(user).id, text, at: now });
    await ticket.save();
    await audit(user, "change.replied", { entityType: "change", entityId: ticket._id, summary: `${code} ${text.slice(0, 80)}` });
    await notify({
      type: programmer ? "change.replied" : "change.ceo_replied",
      recipients: programmer ? [...new Set([ticket.requestedBy?.toString(), ...(await ceoIds())].filter(Boolean))] : await programmerIds(),
      actor: user,
      params: { code, title: label, text: text.slice(0, 120) },
      link: LINK,
      entityType: "change",
      entityId: ticket._id,
    });
    return NextResponse.json({ ticket: (await serializeTickets([ticket.toObject()]))[0] });
  }
  if (!programmer) return forbidden();

  if (ticket.kind === "log") {
    if (body.action !== "edit") return fail("invalid_request");
    const summary = clip(body.summary, 4000);
    if (!summary) return fail("change_summary_required");
    ticket.set({ title: clip(body.title, 200), summary, "fix.how": clip(body.how, 4000) });
    await ticket.save();
    return NextResponse.json({ ticket: (await serializeTickets([ticket.toObject()]))[0] });
  }

  let type = null;
  if (body.action === "accept") {
    if (ticket.status !== "open") return fail("change_not_open", 409);
    ticket.set({ status: "accepted", acceptedBy: user.id, acceptedAt: now });
    type = "change.accepted";
  } else if (body.action === "done") {
    if (!["open", "accepted"].includes(ticket.status)) return fail("change_closed", 409);
    const how = clip(body.how, 4000);
    if (!how) return fail("change_fix_required");
    ticket.set({
      status: "done",
      ...(ticket.acceptedAt ? {} : { acceptedBy: user.id, acceptedAt: now }),
      fix: { how, changes: clip(body.changes, 4000), by: user.id, at: now },
    });
    type = "change.done";
  } else if (body.action === "decline") {
    if (!["open", "accepted"].includes(ticket.status)) return fail("change_closed", 409);
    const note = clip(body.note, 2000);
    if (!note) return fail("change_decline_reason");
    ticket.set({ status: "declined", declineNote: note, declinedAt: now });
    type = "change.declined";
  } else {
    return fail("invalid_request");
  }
  await ticket.save();
  await audit(user, type, { entityType: "change", entityId: ticket._id, summary: `${code} ${label}` });
  await notify({
    type,
    recipients: [...new Set([ticket.requestedBy?.toString(), ...(await ceoIds())].filter(Boolean))],
    actor: user,
    params: { code, title: label },
    link: LINK,
    entityType: "change",
    entityId: ticket._id,
  });
  return NextResponse.json({ ticket: (await serializeTickets([ticket.toObject()]))[0] });
}

// The CEO withdraws a request the programmer hasn't taken on yet (it keeps its number,
// marked withdrawn); the programmer deletes a change they logged themselves.
export async function DELETE(request, { params }) {
  const user = await getCurrentUser();
  if (!isCeo(user) && !isProgrammer(user)) return forbidden();
  const { id } = await params;
  const ticket = isObjectId(id) ? await ChangeTicket.findById(id) : null;
  if (!ticket) return notFound();
  if (isCeo(user) && ticket.kind === "request") {
    if (ticket.status !== "open") return fail("change_not_open", 409);
    ticket.status = "withdrawn";
    await ticket.save();
    await audit(user, "change.withdrawn", { entityType: "change", entityId: ticket._id, summary: `${ticketCode(ticket)} ${ticket.title || ticket.summary.slice(0, 80)}` });
    return NextResponse.json({ ok: true });
  }
  if (!(isProgrammer(user) && ticket.kind === "log")) return forbidden();
  await ticket.deleteOne();
  await audit(user, "change.deleted", { entityType: "change", entityId: ticket._id, summary: `${ticketCode(ticket)} ${ticket.title || ticket.summary.slice(0, 80)}` });
  return NextResponse.json({ ok: true });
}
