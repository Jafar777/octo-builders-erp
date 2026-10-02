// Project risk (the Excel project report logic) and the project KPI score
// (delivery, quality, cost). Pure functions — callers load the data.

const OPEN = ["todo", "in_progress", "on_hold", "help"];
export const RISK_LEVELS = ["healthy", "medium", "high", "critical"];

// Risk 0–100: overdue, delays, rejections, and progress falling behind elapsed time.
export function projectRisk(p, progress, lateTasks, rejections, now) {
  const due = new Date(p.dueDate).getTime();
  const start = new Date(p.startDate || p.createdAt).getTime();
  const elapsed = due > start ? Math.min(1, Math.max(0, (now - start) / (due - start))) : 1;
  const factors = {
    overdue: now > due && progress < 1 ? 40 : 0,
    behind_schedule: elapsed - progress > 0.25 ? 20 : 0,
    delays: Math.min(30, lateTasks * 4),
    rejections: Math.min(20, rejections * 2),
  };
  const score = Math.min(100, Object.values(factors).reduce((a, b) => a + b, 0));
  const top = Object.entries(factors).sort((a, b) => b[1] - a[1])[0];
  const level = score >= 75 ? "critical" : score >= 50 ? "high" : score >= 25 ? "medium" : "healthy";
  return { score, level, reason: top[1] > 0 ? top[0] : "none", elapsed: Math.round(elapsed * 100) };
}

export function lateTaskCount(tasks, now) {
  return tasks.filter(
    (t) =>
      t.dueAt &&
      ((t.submittedAt && new Date(t.submittedAt) > new Date(t.dueAt)) || (OPEN.includes(t.status) && new Date(t.dueAt).getTime() < now))
  ).length;
}

/**
 * Project KPI score 0–100 (plan 8.6), the average of the parts that have data:
 *   delivery = submitted work handed in on time
 *   quality  = reviews approved first time (approved ÷ approved + rejected)
 *   cost     = 100 within budget, minus the % over budget
 */
export function projectScore(tasks, { budget = 0, cost = null } = {}) {
  const submitted = tasks.filter((t) => t.submittedAt && t.dueAt && ["task", "revision"].includes(t.kind));
  const delivery = submitted.length
    ? Math.round((submitted.filter((t) => new Date(t.submittedAt) <= new Date(t.dueAt)).length / submitted.length) * 100)
    : null;
  const approved = tasks.filter((t) => t.status === "approved").length;
  const rejected = tasks.filter((t) => t.status === "rejected").length;
  const quality = approved + rejected ? Math.round((approved / (approved + rejected)) * 100) : null;
  const costScore = budget > 0 && cost !== null ? Math.max(0, Math.round(100 - Math.max(0, ((cost - budget) / budget) * 100))) : null;
  const parts = [delivery, quality, costScore].filter((x) => x !== null);
  return {
    score: parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null,
    delivery,
    quality,
    cost: costScore,
  };
}
