import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { pickName, viewerLang } from "@/lib/personName";
import { canApproveSkills } from "@/lib/skills";
import User from "@/models/User";

// Everyone with skills waiting for the general manager.
export async function GET() {
  const user = await requireStaff();
  if (!user || !canApproveSkills(user)) return forbidden();
  const people = await User.find(
    { status: { $ne: "inactive" }, skillRequests: { $elemMatch: { status: "pending" } } },
    { name: 1, nameAr: 1, email: 1, avatarUrl: 1, skillRequests: 1 }
  ).lean();
  const lang = await viewerLang();
  return NextResponse.json({
    people: people.map((u) => ({
      id: u._id.toString(),
      name: pickName(u, lang),
      avatarUrl: u.avatarUrl || "",
      pending: u.skillRequests.filter((r) => r.status === "pending").map((r) => r.name),
    })),
  });
}
