import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, readJson } from "@/lib/apiUtils";
import User from "@/models/User";

const KEY = /^[a-zA-Z]{1,30}$/;
const keys = (v, max) => [...new Set((Array.isArray(v) ? v : []).map(String).filter((k) => KEY.test(k)))].slice(0, max);

// Their own Overview (change request CR-4): { order, hidden, tiles } — which parts show, in
// what order, and which headline numbers. What each part may show still follows their
// permissions (app/api/home). Viewing as someone ("View as") changes nothing of theirs.
export async function PUT(request) {
  const user = await requireStaff();
  if (!user || user.limited) return forbidden();
  if (user.actingAs) return fail("view_as_read_only", 403);
  const b = await readJson(request);
  const homeLayout = b?.reset ? { order: [], hidden: [], tiles: [] } : { order: keys(b?.order, 30), hidden: keys(b?.hidden, 30), tiles: keys(b?.tiles, 8) };
  await User.updateOne({ _id: user.id }, { $set: { homeLayout } });
  return NextResponse.json({ layout: homeLayout });
}
