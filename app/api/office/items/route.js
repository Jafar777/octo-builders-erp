import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { getSettings } from "@/lib/settings";
import { CLOSED_STATUSES, ITEM_KINDS, OPEN_STATUSES, PRIORITIES } from "@/lib/office";
import { canUseOffice, createItem, dueFor, serializeItems } from "@/lib/officeServer";
import OfficeItem from "@/models/OfficeItem";

const clip = (v, n) => String(v || "").trim().slice(0, n);
const ref = (v) => (isObjectId(v) ? v : null);

// The office's tracked items. ?kind=  ?state=open|closed|overdue|waiting  ?department=  ?q=
export async function GET(request) {
  const user = await getCurrentUser();
  if (!canUseOffice(user)) return forbidden();
  const p = new URL(request.url).searchParams;
  const query = {};
  if (ITEM_KINDS.includes(p.get("kind"))) query.kind = p.get("kind");
  const state = p.get("state") || "open";
  if (state === "open") query.status = { $in: OPEN_STATUSES };
  if (state === "closed") query.status = { $in: CLOSED_STATUSES };
  if (state === "overdue") Object.assign(query, { status: { $in: OPEN_STATUSES }, due: { $lt: new Date() } });
  if (state === "waiting") Object.assign(query, { status: { $in: ["sent", "acknowledged"] } });
  if (isObjectId(p.get("department"))) query.department = p.get("department");
  if (isObjectId(p.get("client"))) query.client = p.get("client");
  const q = clip(p.get("q"), 80);
  if (q) query.title = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  const list = await OfficeItem.find(query).sort(state === "closed" ? { closedAt: -1 } : { due: 1, createdAt: -1 }).limit(300).lean();
  return NextResponse.json({ items: await serializeItems(list, user) });
}

// A new item from the full form: { kind, title, details, due (chip or date), priority,
// client, project, assignee | department }.
export async function POST(request) {
  const user = await getCurrentUser();
  if (!canUseOffice(user)) return forbidden();
  const b = await readJson(request);
  if (!ITEM_KINDS.includes(b.kind) || b.kind === "admin_request") return fail("invalid_request");
  const title = clip(b.title, 300);
  if (!title) return fail("office_text_required");
  const assignee = ref(b.assignee);
  const department = assignee ? null : ref(b.department);
  if (b.kind === "request" && !assignee && !department) return fail("office_request_target");
  const tz = (await getSettings()).hr.timezone;
  const item = await createItem(user, {
    kind: b.kind,
    title,
    details: clip(b.details, 4000),
    due: dueFor(b.due, tz),
    priority: PRIORITIES.includes(b.priority) ? b.priority : "normal",
    client: ref(b.client),
    project: ref(b.project),
    lead: ref(b.lead),
    assignee,
    department,
  });
  return NextResponse.json({ item: (await serializeItems([item.toObject()], user))[0] }, { status: 201 });
}
