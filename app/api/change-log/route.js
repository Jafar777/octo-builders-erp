import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { fail, forbidden, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { canSeeChangeLog, ceoIds, cleanTicket, isCeo, isProgrammer, programmerIds, requester, serializeTickets, ticketCode } from "@/lib/changeLog";
import { nextNumber } from "@/models/Counter";
import ChangeTicket from "@/models/ChangeTicket";

const LINK = "/dashboard/system?tab=changes";

// The change log, newest first, with counts. ?status=open|accepted|done|declined|withdrawn  ?kind=request|log
export async function GET(request) {
  const user = await getCurrentUser();
  if (!canSeeChangeLog(user)) return forbidden();
  const params = new URL(request.url).searchParams;
  const query = {};
  if (["open", "accepted", "done", "declined", "withdrawn"].includes(params.get("status"))) query.status = params.get("status");
  if (["request", "log"].includes(params.get("kind"))) query.kind = params.get("kind");
  const [list, counts] = await Promise.all([
    ChangeTicket.find(query).sort({ createdAt: -1 }).limit(500).lean(),
    ChangeTicket.aggregate([{ $group: { _id: { kind: "$kind", status: "$status" }, n: { $sum: 1 } } }]),
  ]);
  const stats = { requests: 0, open: 0, accepted: 0, done: 0, declined: 0, withdrawn: 0, logs: 0 };
  for (const c of counts) {
    if (c._id.kind === "log") stats.logs += c.n;
    else {
      stats.requests += c.n;
      stats[c._id.status] += c.n;
    }
  }
  return NextResponse.json({ tickets: await serializeTickets(list), stats, canRequest: isCeo(user), canAnswer: isProgrammer(user) });
}

// The CEO: a request from the page they're on. The programmer: a change of their own
// ({ title?, summary, how? }), logged as done.
export async function POST(request) {
  const user = await getCurrentUser();
  const ceo = isCeo(user);
  const programmer = isProgrammer(user);
  if (!ceo && !programmer) return forbidden();
  const body = await readJson(request);
  const { value, error } = cleanTicket(body);
  if (error) return fail(error);

  const kind = ceo ? "request" : "log";
  const now = new Date();
  const ticket = await ChangeTicket.create({
    ...value,
    kind,
    number: await nextNumber(kind === "request" ? "change-request" : "change-log"),
    ...(ceo
      ? { status: "open", requestedBy: requester(user).id, viewAs: requester(user).viewAs || {} }
      : { status: "done", page: { path: "", key: value.page.key, label: value.page.label, tab: "" }, fix: { how: String(body.how || "").trim().slice(0, 4000), changes: "", by: user.id, at: now } }),
  });
  const code = ticketCode(ticket);
  await audit(user, ceo ? "change.requested" : "change.logged", { entityType: "change", entityId: ticket._id, summary: `${code} ${value.title || value.summary.slice(0, 80)}` });
  await notify({
    type: ceo ? "change.requested" : "change.logged",
    recipients: ceo ? await programmerIds() : await ceoIds(),
    actor: user,
    params: { code, title: value.title || value.summary.slice(0, 80), page: value.page.label },
    link: LINK,
    entityType: "change",
    entityId: ticket._id,
  });
  return NextResponse.json({ ticket: (await serializeTickets([ticket.toObject()]))[0] }, { status: 201 });
}
