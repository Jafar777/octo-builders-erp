import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { serializeTemplate } from "@/lib/projects";
import { canSeeSalesMoney, cleanQuotation, peopleNames, serializeQuotation } from "@/lib/sales";
import { getSettings } from "@/lib/settings";
import { nextNumber } from "@/models/Counter";
import ProjectTemplate from "@/models/ProjectTemplate";
import Quotation from "@/models/Quotation";

// Quotations (?lead=<id> for one lead's), with the project templates to build them from.
export async function GET(request) {
  const user = await requirePermission("sales.manage");
  if (!user || user.limited) return forbidden();
  const lead = new URL(request.url).searchParams.get("lead");
  const list = await Quotation.find(isObjectId(lead) ? { lead } : {}).sort({ createdAt: -1 }).limit(500).lean();
  const money = canSeeSalesMoney(user);
  const names = await peopleNames(list.flatMap((q) => (q.delivery?.stages || []).map((s) => s.person)));
  const templates = await ProjectTemplate.find({ active: { $ne: false } }).lean();
  return NextResponse.json({
    quotations: list.map((q) => serializeQuotation(q, { money, names })),
    templates: templates.map(serializeTemplate),
    money,
  });
}

export async function POST(request) {
  const user = await requirePermission("sales.manage");
  if (!user || user.limited) return forbidden();
  const v = await cleanQuotation(await readJson(request), { money: canSeeSalesMoney(user), settings: await getSettings() });
  if (v.error) return fail(v.error);
  const year = new Date().getFullYear();
  const q = await Quotation.create({ ...v.value, number: `Q-${year}-${String(await nextNumber(`quote-${year}`)).padStart(4, "0")}`, createdBy: user.id });
  await audit(user, "sales.quote_added", { entityType: "quotation", entityId: q._id, summary: `${q.number} · ${q.projectName}` });
  return NextResponse.json({ id: q._id.toString() }, { status: 201 });
}
