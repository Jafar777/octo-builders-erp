import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { canSeeSalesMoney, peopleNames, serializeLead } from "@/lib/sales";
import Lead, { LEAD_SOURCES } from "@/models/Lead";

const idStr = (v) => (v ? v.toString() : null);

// All leads (the Sales page board), most recently touched first.
export async function GET() {
  const user = await requirePermission("sales.manage");
  if (!user || user.limited) return forbidden();
  const list = await Lead.find().sort({ updatedAt: -1 }).limit(1000).lean();
  const money = canSeeSalesMoney(user);
  const names = await peopleNames(list.flatMap((l) => [l.owner, ...(l.notes || []).map((n) => n.by)]));
  return NextResponse.json({ leads: list.map((l) => serializeLead(l, { money, names })), money });
}

// { name, company, phone, email, source, department, need, estimatedValue?, currency?, nextAction? }
export async function POST(request) {
  const user = await requirePermission("sales.manage");
  if (!user || user.limited) return forbidden();
  const body = await readJson(request);
  const name = String(body.name || "").trim().slice(0, 150);
  if (!name) return fail("name_required");
  const lead = await Lead.create({
    name,
    company: String(body.company || "").trim().slice(0, 150),
    phone: String(body.phone || "").trim().slice(0, 40),
    email: String(body.email || "").trim().slice(0, 150),
    source: LEAD_SOURCES.includes(body.source) ? body.source : "other",
    department: isObjectId(body.department) ? body.department : null,
    need: String(body.need || "").trim().slice(0, 2000),
    ...(canSeeSalesMoney(user) ? { estimatedValue: Math.max(0, Number(body.estimatedValue) || 0), currency: String(body.currency || "").slice(0, 5) } : {}),
    nextAction: { date: /^\d{4}-\d{2}-\d{2}$/.test(body.nextAction?.date || "") ? body.nextAction.date : "", note: String(body.nextAction?.note || "").slice(0, 300) },
    owner: user.id,
    createdBy: user.id,
  });
  await audit(user, "sales.lead_added", { entityType: "lead", entityId: lead._id, summary: name });
  return NextResponse.json({ id: idStr(lead._id) }, { status: 201 });
}
