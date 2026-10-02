import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { ORG_TYPES, orgItemInUse, serializeOrgItem } from "@/lib/org";
import { syncStaffChannels } from "@/lib/messaging";
import { isBilingualComplete } from "@/lib/validateBilingual";

async function load(params) {
  const { type, id } = await params;
  const config = ORG_TYPES[type];
  if (!config || !isObjectId(id)) return {};
  return { type, id, config, item: await config.Model.findById(id) };
}

export async function PATCH(request, { params }) {
  const actor = await requirePermission("org.manage");
  if (!actor) return forbidden();
  const { type, id, config, item } = await load(params);
  if (!item) return notFound();

  const data = config.clean(await readJson(request));
  if (!isBilingualComplete(data.name)) return fail("bilingual_required");

  item.set(data);
  await item.save();
  await audit(actor, `${type}.updated`, { entityType: type, entityId: id, summary: data.name.en, details: data });
  if (type === "departments") await syncStaffChannels();

  return NextResponse.json({ item: serializeOrgItem(item.toObject()) });
}

// Items that people are still assigned to can only be deactivated, not deleted.
export async function DELETE(request, { params }) {
  const actor = await requirePermission("org.manage");
  if (!actor) return forbidden();
  const { type, id, item } = await load(params);
  if (!item) return notFound();
  if (await orgItemInUse(type, id)) return fail("in_use", 409);

  await item.deleteOne();
  await audit(actor, `${type}.deleted`, { entityType: type, entityId: id, summary: item.name?.en });
  return NextResponse.json({ ok: true });
}
