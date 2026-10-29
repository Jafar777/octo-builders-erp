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

// Only the project's own work counts: a help request copies its task's due date
// (and stage), so counting it too would score the same delay or rejection twice.
const isWork = (t) => ["task", "revision"].includes(t.kind);
const isOverdueOpen = (t, now) => OPEN.includes(t.status) && t.dueAt && new Date(t.dueAt).getTime() < now;

export function lateTaskCount(tasks, now) {
  return tasks.filter(
    (t) => isWork(t) && t.dueAt && ((t.submittedAt && new Date(t.submittedAt) > new Date(t.dueAt)) || isOverdueOpen(t, now))
  ).length;
}

export function rejectionCount(tasks) {
  return tasks.filter((t) => isWork(t) && t.status === "rejected").length;
}

// Schedule against Baseline 1, like a Gantt tool's finish variance: 100 when the
// project finishes (or is expected to) by its Baseline 1 delivery, minus the slip as a
// share of the planned duration (a slip as long as the plan itself = 0). Null without
// a baseline.
export function scheduleScore(baseline, end) {
  if (!baseline?.end || !end) return null;
  const planEnd = new Date(baseline.end).getTime();
  const planStart = baseline.start ? new Date(baseline.start).getTime() : null;
  const duration = planStart !== null && planEnd > planStart ? planEnd - planStart : 24 * 3600000;
  const slip = Math.max(0, new Date(end).getTime() - planEnd);
  return Math.max(0, Math.round(100 - (slip / duration) * 100));
}

/**
 * Project KPI score 0–100 (plan 8.6), the average of the parts that have data:
 *   delivery = work handed in on time ÷ (work handed in + open work already past its due date)
 *   schedule = expected (or actual) delivery against Baseline 1 (see scheduleScore)
 *   quality  = reviews that approved the work (approved ÷ approved + rejected)
 *   cost     = 100 within budget, minus the % over budget
 * Task due dates follow the live plan (they move when earlier work runs late), so
 * delivery alone can't show a project slipping: schedule compares with the baseline.
 * `baseline` = Baseline 1 { start, end }; `end` = the expected delivery (forecastEnd),
 * or when it actually finished.
 */
export function projectScore(tasks, { budget = 0, cost = null, now = Date.now(), baseline = null, end = null } = {}) {
  const work = tasks.filter(isWork);
  const handedIn = work.filter((t) => t.submittedAt && t.dueAt);
  const overdue = work.filter((t) => !t.submittedAt && isOverdueOpen(t, now)).length;
  const delivery =
    handedIn.length + overdue
      ? Math.round((handedIn.filter((t) => new Date(t.submittedAt) <= new Date(t.dueAt)).length / (handedIn.length + overdue)) * 100)
      : null;
  const approved = work.filter((t) => t.status === "approved").length;
  const rejected = work.filter((t) => t.status === "rejected").length;
  const quality = approved + rejected ? Math.round((approved / (approved + rejected)) * 100) : null;
  const costScore = budget > 0 && cost !== null ? Math.max(0, Math.round(100 - Math.max(0, ((cost - budget) / budget) * 100))) : null;
  const schedule = scheduleScore(baseline, end);
  const parts = [delivery, schedule, quality, costScore].filter((x) => x !== null);
  return {
    score: parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null,
    delivery,
    schedule,
    quality,
    cost: costScore,
  };
}
