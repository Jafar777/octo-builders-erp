// Who may use a project's files (change request CR-2). Everyone who can open the project
// sees, downloads and uploads its files, and its managers delete them, until the CEO
// restricts them: then only the people and departments the CEO listed, each with their
// own levels. The CEO always has every level, and alone changes the list.
import { projectAccess } from "@/lib/projects";
import { userDepartments } from "@/lib/scope";

export const FILE_LEVELS = ["view", "download", "upload", "delete"];
const idStr = (v) => (v ? v.toString() : "");

export const decidesFileAccess = (user) => Boolean(user?.isStaff && user.role === "ceo");

// Levels a grant gives: anything more than seeing the list includes seeing it.
function expand(levels = []) {
  const set = new Set(levels.filter((l) => FILE_LEVELS.includes(l)));
  if (set.size) set.add("view");
  return set;
}

// { view, download, upload, delete } for `user` on `project` (needs project.fileAccess,
// department).
export function fileRights(user, project) {
  const none = { view: false, download: false, upload: false, delete: false };
  const access = projectAccess(user, project);
  if (!access) return none;
  if (decidesFileAccess(user)) return { view: true, download: true, upload: true, delete: true };
  const fa = project.fileAccess;
  if (!fa?.restricted) return { view: true, download: true, upload: true, delete: access === "manage" };
  const mine = new Set(userDepartments(user).map(idStr));
  if (user.department) mine.add(idStr(user.department));
  const got = new Set();
  for (const p of fa.people || []) if (idStr(p.user) === user.id) for (const l of expand(p.levels)) got.add(l);
  for (const d of fa.departments || []) if (mine.has(idStr(d.department))) for (const l of expand(d.levels)) got.add(l);
  return Object.fromEntries(FILE_LEVELS.map((l) => [l, got.has(l)]));
}

// The CEO's list as sent from the Files tab, cleaned: { restricted, people, departments }.
export function cleanFileAccess(body, { userIds, departmentIds }) {
  const levels = (v) => [...expand(Array.isArray(v) ? v : [])];
  const people = [];
  for (const p of Array.isArray(body?.people) ? body.people : []) {
    const id = idStr(p?.id);
    if (userIds.has(id) && !people.some((x) => idStr(x.user) === id)) people.push({ user: id, levels: levels(p.levels) });
  }
  const departments = [];
  for (const d of Array.isArray(body?.departments) ? body.departments : []) {
    const id = idStr(d?.id);
    if (departmentIds.has(id) && !departments.some((x) => idStr(x.department) === id)) departments.push({ department: id, levels: levels(d.levels) });
  }
  return { restricted: Boolean(body?.restricted), people: people.filter((p) => p.levels.length), departments: departments.filter((d) => d.levels.length) };
}

export const serializeFileAccess = (fa) => ({
  restricted: Boolean(fa?.restricted),
  people: (fa?.people || []).map((p) => ({ id: idStr(p.user), levels: p.levels })),
  departments: (fa?.departments || []).map((d) => ({ id: idStr(d.department), levels: d.levels })),
});
