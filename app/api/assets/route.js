import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { peopleNames } from "@/lib/sales";
import { nextNumber } from "@/models/Counter";
import Asset from "@/models/Asset";
import { cleanAsset, serializeAsset } from "@/lib/assets";

const idStr = (v) => (v ? v.toString() : null);

// The register (assets.manage), or ?mine=1: what I hold.
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user?.isStaff || user.limited) return forbidden();
  const mine = new URL(request.url).searchParams.get("mine") === "1";
  if (!mine && !hasPermission(user, "assets.manage")) return forbidden();
  const list = await Asset.find(mine ? { holder: user.id, status: { $ne: "retired" } } : {}).sort({ tag: 1 }).limit(2000).lean();
  const names = await peopleNames(list.flatMap((a) => [a.holder, ...(a.history || []).flatMap((h) => [h.holder, h.by])]));
  const money = hasPermission(user, "assets.manage") && hasPermission(user, "finance.view");
  return NextResponse.json({ assets: list.map((a) => ({ ...serializeAsset(a, names, money) })) });
}

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user?.isStaff || !hasPermission(user, "assets.manage")) return forbidden();
  const b = await readJson(request);
  const data = cleanAsset(b);
  if (!data.name) return fail("title_required");
  const holder = isObjectId(b.holder) ? b.holder : null;
  const asset = await Asset.create({
    ...data,
    status: data.status || (holder ? "in_use" : "in_stock"),
    holder,
    tag: `AS-${String(await nextNumber("asset")).padStart(4, "0")}`,
    history: [{ action: "registered", holder, by: user.id }],
  });
  await audit(user, "assets.added", { entityType: "asset", entityId: asset._id, summary: `${asset.tag} · ${asset.name}` });
  return NextResponse.json({ id: idStr(asset._id) }, { status: 201 });
}
