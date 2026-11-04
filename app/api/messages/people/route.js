import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { DEFAULT_ROLE } from "@/lib/permissions";
import User from "@/models/User";
import { pickName, viewerLang } from "@/lib/personName";
import Department from "@/models/Department";
import { HIDDEN_ROLES } from "@/lib/permissions";
import { withWorkDepartments } from "@/lib/roles";

// Everyone who takes (or took) part in messaging, for names and avatars.
export async function GET() {
  const user = await requireStaff({ limited: true });
  if (!user) return forbidden();

  const [people, departments] = await Promise.all([
    User.find(
      { role: { $nin: [DEFAULT_ROLE, ...HIDDEN_ROLES] } },
      { name: 1, nameAr: 1, email: 1, avatarUrl: 1, department: 1, managedDepartments: 1, access: 1, role: 1, status: 1 }
    )
      .sort({ name: 1 })
      .lean(),
    Department.find({}, { name: 1, color: 1 }).lean(),
  ]);
  const lang = await viewerLang();
  const workers = await withWorkDepartments(people);

  return NextResponse.json({
    people: workers.map((p) => ({
      id: p._id.toString(),
      name: pickName(p, lang),
      email: p.email,
      avatarUrl: p.avatarUrl || "",
      department: p.department ? p.department.toString() : null,
      role: p.role,
      active: p.status !== "inactive",
      // Departments whose tasks they can be given ("all" or ids), Roles page.
      work: p.work,
    })),
    departments: departments.map((d) => ({ id: d._id.toString(), name: d.name, color: d.color })),
  });
}
