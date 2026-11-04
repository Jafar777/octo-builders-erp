import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import Supplier from "@/models/Supplier";

export async function PATCH(request, { params }) {
  const user = await requirePermission("purchasing.approve");
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const b = await readJson(request);
  const set = {};
  for (const [k, n] of [["name", 150], ["category", 80], ["phone", 40], ["email", 150], ["notes", 1000]]) if (b[k] !== undefined) set[k] = String(b[k] || "").trim().slice(0, n);
  if (set.name === "") return fail("title_required");
  const s = await Supplier.findByIdAndUpdate(id, set);
  return s ? NextResponse.json({ ok: true }) : notFound();
}

// Suppliers are hidden, not deleted: old requests still name them.
export async function DELETE(request, { params }) {
  const user = await requirePermission("purchasing.approve");
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  await Supplier.findByIdAndUpdate(id, { active: false });
  return NextResponse.json({ ok: true });
}
