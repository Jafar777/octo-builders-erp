// Read side of the temporary department merges (lib/departmentMerge.js): kept free of
// other lib imports so scope / roles / hierarchy code can use it without import loops.
import DepartmentMerge from "@/models/DepartmentMerge";

const idStr = (v) => (v ? v.toString() : null);

// Merges in force at `now`: active and not past their end date.
export const liveFilter = (now = new Date()) => ({ status: "active", $or: [{ endsAt: null }, { endsAt: { $gt: now } }] });

// The merges in force now: [{ id, departments: [id], manager: id, endsAt }].
export async function activeMerges() {
  const list = await DepartmentMerge.find(liveFilter(), { departments: 1, manager: 1, endsAt: 1 }).lean();
  return list.map((m) => ({ id: m._id.toString(), departments: m.departments.map(idStr), manager: idStr(m.manager), endsAt: m.endsAt }));
}

// The other departments merged with `departmentId` ([] when it isn't merged).
export function mergedWith(merges, departmentId) {
  const id = idStr(departmentId);
  if (!id) return [];
  return merges.filter((m) => m.departments.includes(id)).flatMap((m) => m.departments.filter((d) => d !== id));
}

// The one manager of `departmentId` while it's merged (null when it isn't merged).
export function mergeLead(merges, departmentId) {
  const id = idStr(departmentId);
  return (id && merges.find((m) => m.departments.includes(id))?.manager) || null;
}

// Of `departments`, the ones `userId` still heads: a merged department is headed by the
// merge's manager alone, so its other heads step aside until the merge ends.
export const stillHeaded = (merges, userId, departments) =>
  departments.filter((d) => {
    const lead = mergeLead(merges, d);
    return !lead || lead === userId;
  });

// Departments a manager got from merges whose end date has passed but that the sweep
// (lib/departmentMerge.js endExpiredMerges: daily jobs, Organization page) hasn't
// ended yet: they no longer count, so nobody keeps a merged department past its end.
export async function expiredMergeDepartments(managerId) {
  const list = await DepartmentMerge.find({ status: "active", manager: managerId, endsAt: { $ne: null, $lte: new Date() } }, { addedManaged: 1 }).lean();
  return new Set(list.flatMap((m) => (m.addedManaged || []).map(idStr)));
}
