import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { cleanAsset } from "@/lib/assets";
import { notify } from "@/lib/notify";
import Asset from "@/models/Asset";

const idStr = (v) => (v ? v.toString() : null);

// Its fields, and { holder } to hand it to someone (null = back in stock).
export async function PATCH(request, { params }) {
  const user = await requirePermission("assets.manage");
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const asset = await Asset.findById(id);
  if (!asset) return notFound();
  const b = await readJson(request);
  const data = cleanAsset({ ...asset.toObject(), ...b });
  if (!data.name) return fail("title_required");
  if (!data.status) delete data.status;
  asset.set(data);
  if (b.holder !== undefined) {
    const holder = isObjectId(b.holder) ? b.holder : null;
    if (idStr(holder) !== idStr(asset.holder)) {
      asset.history.push({ action: holder ? "assigned" : "returned", holder, by: user.id, note: String(b.note || "").slice(0, 300) });
      asset.holder = holder;
      if (!b.status) asset.status = holder ? "in_use" : "in_stock";
      if (holder && holder !== user.id) {
        await notify({ type: "asset.assigned", recipients: [holder], actor: user, params: { name: `${asset.tag} ${asset.name}` }, link: "/dashboard/profile", entityType: "asset", entityId: asset._id });
      }
    }
  }
  await asset.save();
  await audit(user, "assets.updated", { entityType: "asset", entityId: id, summary: `${asset.tag} · ${asset.name}` });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const user = await requirePermission("assets.manage");
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const asset = await Asset.findByIdAndDelete(id);
  if (!asset) return notFound();
  await audit(user, "assets.deleted", { entityType: "asset", entityId: id, summary: `${asset.tag} · ${asset.name}` });
  return NextResponse.json({ ok: true });
}
