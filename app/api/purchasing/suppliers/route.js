import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission, requirePermission } from "@/lib/currentUser";
import { fail, forbidden, readJson } from "@/lib/apiUtils";
import Supplier from "@/models/Supplier";

const clean = (b) => ({
  name: String(b.name || "").trim().slice(0, 150),
  category: String(b.category || "").trim().slice(0, 80),
  phone: String(b.phone || "").trim().slice(0, 40),
  email: String(b.email || "").trim().slice(0, 150),
  notes: String(b.notes || "").trim().slice(0, 1000),
});

// Everyone who asks to buy picks from the list; approvers keep it.
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isStaff || user.limited || !["purchasing.request", "purchasing.approve", "assets.manage"].some((p) => hasPermission(user, p))) return forbidden();
  const list = await Supplier.find({ active: { $ne: false } }).sort({ name: 1 }).lean();
  return NextResponse.json({ suppliers: list.map((s) => ({ id: s._id.toString(), ...clean(s) })) });
}

export async function POST(request) {
  const user = await requirePermission("purchasing.approve");
  if (!user) return forbidden();
  const data = clean(await readJson(request));
  if (!data.name) return fail("title_required");
  const s = await Supplier.create(data);
  return NextResponse.json({ id: s._id.toString() }, { status: 201 });
}
