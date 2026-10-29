// Who reviews a handed-in task, and in what order. Pure functions (no database), so the
// screens use them too.
//
// Each task says which of three reviews it needs (set when the project is created):
// its department's manager, the GM / CEO, and the project's customer. They review in
// that order — the team checks the work before the customer sees it. The task is
// approved once every level approved; a rejection at any level sends it back as a redo
// (R-01…), which needs the same reviews. The GM / CEO may step in at any level so no
// task gets stuck: their review counts for both internal levels, and at the customer's
// level it's recorded as given on the customer's behalf.

export const REVIEW_LEVELS = ["manager", "gm", "customer"];
export const INTERNAL_LEVELS = ["manager", "gm"];

// Older tasks (before reviewers were chosen) are reviewed by the department manager.
export const DEFAULT_REVIEW = { manager: true, gm: false, customer: false };

// The levels a task needs, in order. At least one: none chosen = the manager.
export function reviewPlan(task) {
  const flags = task.review || DEFAULT_REVIEW;
  const levels = REVIEW_LEVELS.filter((l) => flags[l]);
  return levels.length ? levels : ["manager"];
}

// The level a handed-in task waits for now, or null once every level approved.
export function pendingLevel(task) {
  const covered = new Set((task.reviews || []).filter((r) => r.decision === "approve").flatMap((r) => (r.covers?.length ? r.covers : [r.level])));
  return reviewPlan(task).find((l) => !covered.has(l)) || null;
}

// { manager, gm, customer } from a request body. The customer review needs a project
// with a customer. Returns { value } or { error }.
export function cleanReviewFlags(v, { hasCustomer = false } = {}) {
  if (!v || typeof v !== "object") return { value: { ...DEFAULT_REVIEW } };
  const value = { manager: Boolean(v.manager), gm: Boolean(v.gm), customer: Boolean(v.customer) };
  if (value.customer && !hasCustomer) return { error: "customer_review_needs_customer" };
  if (!value.manager && !value.gm && !value.customer) return { error: "review_required" };
  return { value };
}
