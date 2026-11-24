// Company hierarchy: who reports to whom. Worked out from the roles unless the CEO
// set someone's "reports to" by hand (the general manager isn't part of it):
//   CEO                    top
//   other company-wide roles (HR, coordinator…)  → the GM
//   department heads       → the GM
//   everyone else          → the head of their department (the GM when it has none)
// Pure functions — callers load the people and roles.

const idStr = (v) => (v ? v.toString() : null);

// `people`: [{ id, role, department, managedDepartments, reportsTo }] (active staff only)
// `roles`:  { [key]: { scope, permissions } }
// `merges`: departments merged for now (lib/mergeState.js activeMerges): their manager
//           heads all of them, and the merged departments' other heads report to them.
// Returns { [id]: { managerId, source: "auto" | "manual" } } — managerId null at the top.
export function buildHierarchy(people, roles, merges = []) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const roleOf = (p) => roles[p.role] || { scope: "self", permissions: [] };
  const isTop = (p) => p.role === "ceo";
  const isHead = (p) => roleOf(p).scope === "department" && roleOf(p).permissions.includes("tasks.review");
  const gm = people.find((p) => p.role === "ceo") || null; // the top of the company

  // Each department's head: a manager working in it, else a manager who also heads it
  // (User.managedDepartments — one manager can head two departments or more).
  const headOf = {};
  for (const p of people) if (isHead(p) && p.department && !headOf[p.department]) headOf[p.department] = p.id;
  for (const p of people) if (isHead(p)) for (const d of p.managedDepartments || []) if (!headOf[d]) headOf[d] = p.id;
  // A merge's manager heads every department in it; that department's own head (now
  // under them) reports to them while the merge lasts.
  const mergeLead = {};
  for (const m of merges) {
    if (!byId.has(m.manager)) continue;
    for (const d of m.departments) {
      headOf[d] = m.manager;
      mergeLead[d] = m.manager;
    }
  }

  const auto = (p) => {
    if (isTop(p)) return null;
    const lead = mergeLead[p.department];
    if (isHead(p) && lead && lead !== p.id) return lead;
    if (isHead(p) || roleOf(p).scope === "all" || !p.department) return gm?.id ?? null;
    return headOf[p.department] || gm?.id || null;
  };

  const result = {};
  for (const p of people) {
    const manual = idStr(p.reportsTo);
    result[p.id] =
      manual && manual !== p.id && byId.has(manual) ? { managerId: manual, source: "manual" } : { managerId: auto(p), source: "auto" };
    if (result[p.id].managerId === p.id) result[p.id] = { managerId: null, source: "auto" };
  }

  // Never loop: a chain that comes back on itself ends at the person who closes it.
  for (const p of people) {
    const seen = new Set([p.id]);
    let cur = result[p.id].managerId;
    while (cur) {
      if (seen.has(cur)) {
        result[p.id] = { managerId: null, source: "auto" };
        break;
      }
      seen.add(cur);
      cur = result[cur]?.managerId ?? null;
    }
  }
  return result;
}

// True if making `userId` report to `managerId` would put them above themselves.
export function wouldLoop(people, roles, userId, managerId, merges = []) {
  if (!managerId) return false;
  const tree = buildHierarchy(people, roles, merges);
  // Only userId's own link changes, so walking up from the new manager is enough.
  const seen = new Set();
  for (let cur = managerId; cur && !seen.has(cur); cur = tree[cur]?.managerId ?? null) {
    if (cur === userId) return true;
    seen.add(cur);
  }
  return false;
}
