import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { fail, forbidden, readJson } from "@/lib/apiUtils";
import { notify } from "@/lib/notify";
import { ADMIN_REQUEST_TYPES } from "@/lib/office";
import { createItem, officeStaffIds, OFFICE_LINK, serializeItems } from "@/lib/officeServer";
import OfficeItem from "@/models/OfficeItem";

const clip = (v, n) => String(v || "").trim().slice(0, n);

// An employee's own requests to the office (salary certificate, experience letter,
// supplies, a booking…).
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isStaff || user.limited) return forbidden();
  const list = await OfficeItem.find({ kind: "admin_request", requester: user.id }).sort({ createdAt: -1 }).limit(100).lean();
  return NextResponse.json({ items: await serializeItems(list, user) });
}

// { adminType, title, details }
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user?.isStaff || user.limited) return forbidden();
  const b = await readJson(request);
  if (!ADMIN_REQUEST_TYPES.includes(b.adminType)) return fail("invalid_request");
  const title = clip(b.title, 300);
  if (!title) return fail("office_text_required");
  const item = await createItem(user, { kind: "admin_request", adminType: b.adminType, title, details: clip(b.details, 2000), requester: user.id });
  const office = (await officeStaffIds()).filter((id) => id !== user.id);
  if (office.length) {
    await notify({ type: "office.admin_request", recipients: office, actor: user, params: { actor: user.name || user.email, title }, link: OFFICE_LINK, entityType: "office", entityId: item._id });
  }
  return NextResponse.json({ item: (await serializeItems([item.toObject()], user))[0] }, { status: 201 });
}
