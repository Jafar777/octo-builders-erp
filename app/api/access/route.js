import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { DEFAULT_ROLE } from "@/lib/permissions";
import { NAME_FIELDS, pickName, viewerLang } from "@/lib/personName";
import { staffQueryFor } from "@/lib/staff";
import Department from "@/models/Department";
import User from "@/models/User";

const idStr = (v) => (v ? v.toString() : null);

// The Roles page's People tab: every account with a role, and its own exceptions to
// that role (User.access). The browser works out what they end up with
// (lib/permissions.js effectiveAccess) so the preview follows each change live.
export async function GET() {
  const actor = await requirePermission("roles.manage");
  if (!actor) return forbidden();

  const [users, departments] = await Promise.all([
    User.find(
      { $and: [staffQueryFor(actor), { role: { $ne: DEFAULT_ROLE } }] },
      { ...NAME_FIELDS, avatarUrl: 1, role: 1, department: 1, managedDepartments: 1, status: 1, trainee: 1, access: 1, lastLoginAt: 1 }
    )
      .sort({ name: 1 })
      .lean(),
    Department.find({}, { name: 1, color: 1 }).lean(),
  ]);
  const lang = await viewerLang();

  return NextResponse.json({
    people: users.map((u) => ({
      id: idStr(u._id),
      name: pickName(u, lang),
      email: u.email,
      avatarUrl: u.avatarUrl || "",
      role: u.role === "admin" ? "ceo" : u.role,
      department: idStr(u.department),
      departments: [...new Set([u.department, ...(u.managedDepartments || [])].filter(Boolean).map(String))],
      status: u.status || "active",
      trainee: Boolean(u.trainee),
      lastLoginAt: u.lastLoginAt || null,
      access: {
        grant: u.access?.grant || [],
        deny: u.access?.deny || [],
        scope: u.access?.scope || null,
        hiddenPages: u.access?.hiddenPages || [],
        workDepartments: (u.access?.workDepartments || []).map(String),
        crossDepartment: typeof u.access?.crossDepartment === "boolean" ? u.access.crossDepartment : null,
        note: u.access?.note || "",
      },
    })),
    departments: departments.map((d) => ({ id: idStr(d._id), name: d.name, color: d.color || "" })),
  });
}
