import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { DEFAULT_ROLE } from "@/lib/permissions";
import { NAME_FIELDS, pickName, viewerLang } from "@/lib/personName";
import User from "@/models/User";

// People who can be a project's customer: accounts that signed up and have no role
// (employees, managers and the GM / CEO all have one).
export async function GET() {
  const user = await requireStaff();
  if (!user || !hasPermission(user, "projects.manage")) return forbidden();
  const people = await User.find({ role: DEFAULT_ROLE, status: "active" }, { ...NAME_FIELDS, avatarUrl: 1 }).sort({ createdAt: -1 }).lean();
  const lang = await viewerLang();
  return NextResponse.json({
    customers: people.map((p) => ({ id: p._id.toString(), name: pickName(p, lang), email: p.email, avatarUrl: p.avatarUrl || "" })),
  });
}
