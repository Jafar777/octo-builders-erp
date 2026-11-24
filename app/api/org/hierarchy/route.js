import { NextResponse } from "next/server";
import { followManagerChange } from "@/lib/managerChange";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { buildHierarchy, wouldLoop } from "@/lib/hierarchy";
import { outsideRoleKeys } from "@/lib/scope";
import { activeMerges } from "@/lib/mergeState";
import { managingRole } from "@/lib/reporting";
import { notify } from "@/lib/notify";
import { pickName, viewerLang } from "@/lib/personName";
import Department from "@/models/Department";
import JobTitle from "@/models/JobTitle";
import Role from "@/models/Role";
import User from "@/models/User";

const idStr = (v) => (v ? v.toString() : null);

async function loadPeople() {
  const [users, roles, merges] = await Promise.all([
    User.find(
      // The general manager (a limited role) isn't part of the organization.
      { role: { $nin: await outsideRoleKeys() }, status: "active" },
      { name: 1, nameAr: 1, email: 1, avatarUrl: 1, role: 1, department: 1, managedDepartments: 1, jobTitle: 1, reportsTo: 1 }
    )
      .sort({ name: 1 })
      .lean(),
    Role.find({}, { key: 1, name: 1, scope: 1, permissions: 1 }).lean(),
    activeMerges(),
  ]);
  const roleMap = Object.fromEntries(roles.map((r) => [r.key, r]));
  const people = users.map((u) => ({
    id: u._id.toString(),
    role: u.role,
    department: idStr(u.department),
    managedDepartments: (u.managedDepartments || []).map(idStr),
    reportsTo: idStr(u.reportsTo),
  }));
  return { users, roleMap, people, merges };
}

// The company hierarchy for every employee: names, photos, titles and who reports to whom.
// Nothing else about people is sent.
export async function GET() {
  const user = await requireStaff();
  if (!user) return forbidden();

  const [{ users, roleMap, people, merges }, departments, jobTitles, lang] = await Promise.all([
    loadPeople(),
    Department.find({}, { name: 1, color: 1 }).lean(),
    JobTitle.find({}, { name: 1 }).lean(),
    viewerLang(),
  ]);
  const tree = buildHierarchy(people, roleMap, merges);
  const titles = Object.fromEntries(jobTitles.map((j) => [j._id.toString(), j.name]));

  return NextResponse.json({
    people: users.map((u) => {
      const id = u._id.toString();
      return {
        id,
        name: pickName(u, lang),
        avatarUrl: u.avatarUrl || "",
        role: u.role,
        roleName: roleMap[u.role]?.name || { ar: u.role, en: u.role },
        department: idStr(u.department),
        // Other departments this manager heads too.
        managedDepartments: (u.managedDepartments || []).map(idStr).filter((d) => d !== idStr(u.department)),
        jobTitle: titles[idStr(u.jobTitle)] || null,
        // Can people be moved to them for real (tasks, leave, KPI — lib/reporting.js)?
        managesPeople: managingRole(roleMap[u.role]),
        managerId: tree[id].managerId,
        source: tree[id].source,
      };
    }),
    departments: departments.map((d) => ({ id: d._id.toString(), name: d.name, color: d.color })),
    // Departments merged for now: who leads them and until when.
    merges: merges.map((m) => ({ id: m.id, departments: m.departments, manager: m.manager, endsAt: m.endsAt })),
    canEdit: hasPermission(user, "org.manage"),
  });
}

// GM: set who someone reports to (null = back to automatic).
export async function PATCH(request) {
  const actor = await requireStaff();
  if (!actor || !hasPermission(actor, "org.manage")) return forbidden();
  const body = await readJson(request);
  if (!isObjectId(body.userId)) return fail("invalid_request");
  const managerId = body.managerId ? String(body.managerId) : null;
  if (managerId && !isObjectId(managerId)) return fail("invalid_request");

  const { users, roleMap, people, merges } = await loadPeople();
  const target = users.find((u) => u._id.toString() === body.userId);
  if (!target) return fail("invalid_request");
  if (managerId && !people.some((p) => p.id === managerId)) return fail("invalid_request");
  if (wouldLoop(people, roleMap, body.userId, managerId, merges)) return fail("hierarchy_loop");

  await User.updateOne({ _id: target._id }, { $set: { reportsTo: managerId } });
  // What waits for their manager (leave, overtime, reviews) goes to the new one.
  await followManagerChange([body.userId], actor);
  const manager = managerId ? users.find((u) => u._id.toString() === managerId) : null;
  // The person and their new manager learn it (it changes who approves their leave,
  // gives them work and counts them in their KPI team).
  if (manager && managingRole(roleMap[manager.role])) {
    await notify({
      type: "org.reports_to",
      recipients: [body.userId, managerId],
      actor,
      params: { person: target.name || target.email, manager: manager.name || manager.email },
      paramsAr: { person: target.nameAr || target.name || target.email, manager: manager.nameAr || manager.name || manager.email },
      link: "/dashboard/organization",
    });
  }
  await audit(actor, "org.reports_to", {
    entityType: "user",
    entityId: target._id,
    summary: `${target.name || target.email} → ${manager ? manager.name || manager.email : "auto"}`,
  });
  return NextResponse.json({ ok: true });
}
