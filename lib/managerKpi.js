import { hasPermission } from "@/lib/currentUser";
import Role from "@/models/Role";

// Department managers = roles limited to their department that review its work
// (the default "Department Head" role).
export async function managerRoleKeys() {
  const roles = await Role.find({ scope: "department", permissions: "tasks.review" }, { key: 1 }).lean();
  return roles.map((r) => r.key);
}

export const isDeptManager = (user) => user?.scope === "department" && hasPermission(user, "tasks.review");

// The GM / CEO rate department managers.
export const canRateManagers = (user) => user?.scope === "all" && hasPermission(user, "kpi.manage");

// Rating (1–5 per criterion) → 0–100. Criteria without a score are left out.
export function ratingPercent(rating, criteria) {
  if (!rating) return null;
  const keys = new Set(criteria.map((c) => c.key));
  const scores = (rating.scores || []).filter((s) => keys.has(s.key) && s.score >= 1);
  if (!scores.length) return null;
  return Math.round((scores.reduce((a, s) => a + s.score, 0) / (scores.length * 5)) * 100);
}
