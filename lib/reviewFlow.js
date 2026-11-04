// Who reviews a handed-in task, and in what order. Pure functions (no database), so the
// screens use them too.
//
// Every task is reviewed by its department's manager. The manager's "accept" approves it
// at once; "accept if the CEO accepts" sends it on to the CEO (task.ceoApproval), whose
// accept approves it and whose reject rejects it. A task of a project with a customer
// may also be reviewed by the customer, last. The team checks the work before the
// customer sees it. (Older tasks may also have the GM / CEO level set on them.) The task is
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
  // The manager asked for the CEO's approval too.
  const levels = REVIEW_LEVELS.filter((l) => flags[l] || (l === "gm" && task.ceoApproval));
  return levels.length ? levels : ["manager"];
}

// The decisions a reviewer can take. "approve_ceo" (accept if the CEO accepts) is the
// department manager's, on a task that doesn't go to the CEO yet.
export const REVIEW_DECISIONS = ["approve", "approve_ceo", "reject"];

// The level a handed-in task waits for now, or null once every level approved.
export function pendingLevel(task) {
  const covered = new Set((task.reviews || []).filter((r) => r.decision === "approve").flatMap((r) => (r.covers?.length ? r.covers : [r.level])));
  return reviewPlan(task).find((l) => !covered.has(l)) || null;
}

// { manager, gm, customer } from a request body. The department manager always reviews
// and the CEO only when the manager asks at review time, so only the customer review is
// chosen here (it needs a project with a customer). Returns { value } or { error }.
export function cleanReviewFlags(v, { hasCustomer = false } = {}) {
  const value = { manager: true, gm: false, customer: Boolean(v && typeof v === "object" && v.customer) };
  if (value.customer && !hasCustomer) return { error: "customer_review_needs_customer" };
  return { value };
}
