// Company hierarchy: who reports to whom. Worked out from the roles unless the GM
// set someone's "reports to" by hand:
//   GM                     top (the CEO too, unless set to report to someone)
//   other company-wide roles (HR, coordinator…)  → the GM
//   department heads       → the GM
//   everyone else          → the head of their department (the GM when it has none)
// Pure functions — callers load the people and roles.

const idStr = (v) => (v ? v.toString() : null);

// `people`: [{ id, role, department, reportsTo }] (active staff only)
// `roles`:  { [key]: { scope, permissions } }
// Returns { [id]: { managerId, source: "auto" | "manual" } } — managerId null at the top.
export function buildHierarchy(people, roles) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const roleOf = (p) => roles[p.role] || { scope: "self", permissions: [] };
  const isTop = (p) => ["gm", "ceo"].includes(p.role);
  const isHead = (p) => roleOf(p).scope === "department" && roleOf(p).permissions.includes("tasks.review");
  const gm = people.find((p) => p.role === "gm") || people.find((p) => p.role === "ceo") || null;

  const headOf = {};
  for (const p of people) if (isHead(p) && p.department && !headOf[p.department]) headOf[p.department] = p.id;

  const auto = (p) => {
    if (isTop(p)) return null;
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
export function wouldLoop(people, roles, userId, managerId) {
  if (!managerId) return false;
  const tree = buildHierarchy(people, roles);
  // Only userId's own link changes, so walking up from the new manager is enough.
  const seen = new Set();
  for (let cur = managerId; cur && !seen.has(cur); cur = tree[cur]?.managerId ?? null) {
    if (cur === userId) return true;
    seen.add(cur);
  }
  return false;
}
