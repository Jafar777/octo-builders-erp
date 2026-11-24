// Who manages whom, for everything about a PERSON (giving them work, their leave and
// overtime, their HR file and KPI, their appraisal, who they rate). The organization
// chart decides:
//   - the CEO moved someone in the chart (User.reportsTo) to a person who manages
//     people → that person manages them, and their department's manager no longer does;
//   - otherwise their department's managers, as always (lib/leave.js departmentManagers).
// A link to someone without a managing role (an ordinary employee) only draws the chart.
// The review of WORK stays with the department the work belongs to (lib/taskReview.js).
import Role from "@/models/Role";
import User from "@/models/User";
import { headsOf, inScope } from "@/lib/scope";
import { effectiveAccess } from "@/lib/permissions";

const idStr = (v) => (v ? v.toString() : null);

// The roles a chart link can move people to: department managers (department scope,
// reviewing work — lib/managerKpi.js) and the company-wide roles.
export const managingRole = (role) =>
  Boolean(role) && (role.scope === "all" || (role.scope === "department" && (role.permissions || []).includes("tasks.review")));
const deptManagerRole = (role) => Boolean(role) && role.scope === "department" && (role.permissions || []).includes("tasks.review");

// The chart links that count: Map(personId → managerId), and which managers hold a
// department manager role (vs a company-wide one).
export async function loadLinks() {
  const linked = await User.find({ status: "active", reportsTo: { $ne: null } }, { reportsTo: 1 }).lean();
  if (!linked.length) return { links: new Map(), deptManagers: new Set() };
  const targets = await User.find({ _id: { $in: linked.map((u) => u.reportsTo) }, status: "active" }, { role: 1 }).lean();
  const roles = Object.fromEntries((await Role.find({ key: { $in: [...new Set(targets.map((t) => t.role))] } }, { key: 1, scope: 1, permissions: 1 }).lean()).map((r) => [r.key, r]));
  const ok = new Map(targets.map((t) => [idStr(t._id), roles[t.role]]));
  const links = new Map();
  const deptManagers = new Set();
  for (const u of linked) {
    const to = idStr(u.reportsTo);
    if (to === idStr(u._id) || !managingRole(ok.get(to))) continue;
    links.set(idStr(u._id), to);
    if (deptManagerRole(ok.get(to))) deptManagers.add(to);
  }
  return { links, deptManagers };
}

// Is `person` ({ id|_id, department }) in `user`'s reach for people matters?
// `user` is a current user (scope, departments). Self is always in reach.
export function reachesPerson(user, person, { links }) {
  const id = idStr(person.id || person._id);
  if (!user || !id) return false;
  if (id === user.id || user.scope === "all") return true;
  if (user.scope !== "department") return false;
  const link = links.get(id);
  if (link) return link === user.id;
  return inScope(user, person.department);
}

// The ids of the people `user` reaches (department scope): their departments' members
// not moved to someone else, plus the people moved to them. Includes themselves.
export async function reachedIds(user, ctx = null) {
  const { links } = ctx || (await loadLinks());
  const members = await User.find({ department: { $in: user.departments || [] } }, { _id: 1, department: 1 }).lean();
  const ids = new Set([user.id]);
  for (const m of members) if (reachesPerson(user, m, { links })) ids.add(idStr(m._id));
  for (const [person, to] of links) if (to === user.id) ids.add(person);
  return [...ids];
}

// The department managers who decide first for `person` (their leave, overtime,
// appraisal, team rating): the manager the chart moved them to — none when that's a
// company-wide person, who decides at the final step anyway — else their department's.
export async function personManagers(person, ctx = null) {
  const id = idStr(person.id || person._id);
  const { links, deptManagers } = ctx || (await loadLinks());
  const link = links.get(id);
  if (link) return deptManagers.has(link) ? [link] : [];
  if (!person.department) return [];
  const roles = await Role.find({ scope: "department", permissions: "tasks.review" }, { key: 1 }).lean();
  const users = await User.find({ status: "active", role: { $in: roles.map((r) => r.key) }, ...(await headsOf(person.department)) }, { _id: 1 }).lean();
  // (A manager moved under someone else in the chart still runs their department;
  // a merged department has the merge's manager alone.)
  return users.map((u) => idStr(u._id)).filter((m) => m !== id);
}

// Of `ids`, those whose access (role + their own exceptions) holds `permission`.
export async function holding(ids, permission) {
  if (!ids.length) return [];
  const users = await User.find({ _id: { $in: ids }, status: "active" }, { role: 1, access: 1 }).lean();
  const roles = Object.fromEntries((await Role.find({ key: { $in: [...new Set(users.map((u) => u.role))] } }).lean()).map((r) => [r.key, r]));
  return users.filter((u) => effectiveAccess(roles[u.role], u.access, u.role).permissions.includes(permission)).map((u) => idStr(u._id));
}
