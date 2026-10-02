import { NextResponse } from "next/server";
import { requirePermission, requireStaff } from "@/lib/currentUser";
import { fail, forbidden, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { ORG_TYPES, serializeOrgItem } from "@/lib/org";
import { syncStaffChannels } from "@/lib/messaging";
import { isBilingualComplete } from "@/lib/validateBilingual";

export async function GET(request, { params }) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const { type } = await params;
  const config = ORG_TYPES[type];
  if (!config) return notFound();

  const items = await config.Model.find().sort(config.sort).lean();
  return NextResponse.json({ items: items.map(serializeOrgItem) });
}

export async function POST(request, { params }) {
  const actor = await requirePermission("org.manage");
  if (!actor) return forbidden();
  const { type } = await params;
  const config = ORG_TYPES[type];
  if (!config) return notFound();

  const data = config.clean(await readJson(request));
  if (!isBilingualComplete(data.name)) return fail("bilingual_required");

  if (type === "departments" && !Number.isFinite(data.order)) {
    data.order = await config.Model.countDocuments();
  }
  const item = await config.Model.create(data);
  await audit(actor, `${type}.created`, { entityType: type, entityId: item._id, summary: data.name.en, details: data });
  if (type === "departments") await syncStaffChannels();

  return NextResponse.json({ item: serializeOrgItem(item.toObject()) }, { status: 201 });
}
