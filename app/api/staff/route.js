import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { viewerLang } from "@/lib/personName";
import { serializeStaff, staffQueryFor } from "@/lib/staff";
import User from "@/models/User";
import WorkProject from "@/models/WorkProject";

export async function GET() {
  const user = await requirePermission("users.view");
  if (!user) return forbidden();

  const users = await User.find(staffQueryFor(user)).sort({ createdAt: -1 }).lean();
  const lang = await viewerLang();
  // Customers of a project have no role on purpose: they aren't waiting for one.
  const customers = new Set((await WorkProject.distinct("customer", { customer: { $ne: null } })).map(String));
  return NextResponse.json({ staff: users.map((u) => ({ ...serializeStaff(u, lang), customer: customers.has(String(u._id)) })) });
}
