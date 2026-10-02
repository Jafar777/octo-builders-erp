import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { DEFAULT_ROLE } from "@/lib/permissions";
import User from "@/models/User";
import Department from "@/models/Department";

// Everyone who takes (or took) part in messaging, for names and avatars.
export async function GET() {
  const user = await requireStaff();
  if (!user) return forbidden();

  const [people, departments] = await Promise.all([
    User.find(
      { role: { $ne: DEFAULT_ROLE } },
      { name: 1, email: 1, avatarUrl: 1, department: 1, role: 1, status: 1 }
    )
      .sort({ name: 1 })
      .lean(),
    Department.find({}, { name: 1, color: 1 }).lean(),
  ]);

  return NextResponse.json({
    people: people.map((p) => ({
      id: p._id.toString(),
      name: p.name || p.email,
      email: p.email,
      avatarUrl: p.avatarUrl || "",
      department: p.department ? p.department.toString() : null,
      role: p.role,
      active: p.status !== "inactive",
    })),
    departments: departments.map((d) => ({ id: d._id.toString(), name: d.name, color: d.color })),
  });
}
