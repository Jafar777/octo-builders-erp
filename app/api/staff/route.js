import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { viewerLang } from "@/lib/personName";
import { serializeStaff, staffQueryFor } from "@/lib/staff";
import User from "@/models/User";

export async function GET() {
  const user = await requirePermission("users.view");
  if (!user) return forbidden();

  const users = await User.find(staffQueryFor(user)).sort({ createdAt: -1 }).lean();
  const lang = await viewerLang();
  return NextResponse.json({ staff: users.map((u) => serializeStaff(u, lang)) });
}
