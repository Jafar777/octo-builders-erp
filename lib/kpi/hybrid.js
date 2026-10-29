// Hybrid KPI of department managers. A department head both runs a team and does
// design work, so their score has two parts:
//
//   Management KPI — how their team did: on-time delivery, first-time approval,
//     utilisation, workload balance, the team's KPI and how fast the head reviews
//     handed-in work (slow reviews hold up the plan) — plus the GM / CEO's monthly
//     1–5 rating for what the system can't see (leadership, communication…).
//   Execution KPI  — their own work: the same system score every employee gets
//     (attendance, own tasks, quality, skills).
//
//   Final = Management × management share + Execution × (1 − management share)
//
// The management share is set per person (Users → "Management %"), else the company
// default. The share measured from the data (task hours ÷ hours worked) is shown next
// to it as a check, not used: reviews, meetings and planning aren't logged as tasks.
// Pure functions (no database).

export const TEAM_METRICS = ["on_time", "quality", "utilization", "balance", "team_kpi", "review_speed"];
export const DEFAULT_TEAM_WEIGHTS = { on_time: 25, quality: 20, utilization: 15, balance: 10, team_kpi: 20, review_speed: 10 };
export const DEFAULT_MANAGEMENT_SHARE = 60;
export const DEFAULT_RATING_WEIGHT = 30;
// Team utilisation at or above this counts as full marks.
export const UTILIZATION_TARGET = 85;
// Fewer own tasks than this: the execution part counts for less (one late task
// shouldn't swing a manager who mostly manages).
export const MIN_EXECUTION_TASKS = 3;

const round = (n) => (n === null || n === undefined ? null : Math.round(n));
const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
const clamp = (n) => Math.max(0, Math.min(100, n));

// Review turnaround (median hours from hand-in to the head's review) → 0–100.
export function reviewSpeedScore(hours) {
  if (!hours.length) return null;
  const sorted = [...hours].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median <= 8) return 100;
  if (median <= 24) return 85;
  if (median <= 48) return 65;
  if (median <= 96) return 40;
  return 20;
}

// The team's results (0–100 each, null without data).
// members: [{ score, counts: { handedIn, late, firstReviewed, firstApproved, taskHours, workedHours } }]
// reviewHours: hours from hand-in to each review the head gave this month.
export function teamMetrics(members, reviewHours = []) {
  const sum = (key) => members.reduce((n, m) => n + (m.counts?.[key] || 0), 0);
  const handedIn = sum("handedIn");
  const firstReviewed = sum("firstReviewed");
  const worked = sum("workedHours");
  const utilization = worked ? (sum("taskHours") / worked) * 100 : null;
  // Workload balance: how evenly the work is spread (1 − coefficient of variation of
  // each member's utilisation). Needs two people with hours.
  const utils = members.filter((m) => m.counts?.workedHours > 0).map((m) => (m.counts.taskHours / m.counts.workedHours) * 100);
  const avg = mean(utils);
  const balance = utils.length >= 2 && avg > 0 ? clamp(100 - (Math.sqrt(mean(utils.map((u) => (u - avg) ** 2))) / avg) * 100) : null;
  return {
    on_time: handedIn ? round(((handedIn - sum("late")) / handedIn) * 100) : null,
    quality: firstReviewed ? round((sum("firstApproved") / firstReviewed) * 100) : null,
    utilization: utilization === null ? null : round(clamp((utilization / UTILIZATION_TARGET) * 100)),
    balance: round(balance),
    team_kpi: round(mean(members.map((m) => m.score).filter((s) => s !== null && s !== undefined))),
    review_speed: reviewSpeedScore(reviewHours),
  };
}

// Management KPI: the team metrics (weighted, only those with data) blended with the
// GM / CEO rating. Returns { score, team } (null when there's nothing to go on).
export function managementScore(metrics, weights = DEFAULT_TEAM_WEIGHTS, rating = null, ratingWeight = DEFAULT_RATING_WEIGHT) {
  const parts = TEAM_METRICS.filter((k) => metrics[k] !== null && metrics[k] !== undefined && (weights[k] || 0) > 0);
  const total = parts.reduce((n, k) => n + weights[k], 0);
  const team = total ? round(parts.reduce((n, k) => n + metrics[k] * weights[k], 0) / total) : null;
  if (team === null && rating === null) return { score: null, team: null };
  if (rating === null) return { score: team, team };
  if (team === null) return { score: rating, team: null };
  return { score: round(team * (1 - ratingWeight / 100) + rating * (ratingWeight / 100)), team };
}

// The management share measured from the data: 100 − task hours ÷ hours worked.
export function measuredShare(taskHours, workedHours) {
  if (!workedHours) return null;
  return round(clamp(100 - (taskHours / workedHours) * 100));
}

// Final hybrid score. share = management share (0–100); execTasks = own tasks handed
// in this month. With fewer than MIN_EXECUTION_TASKS, the execution part keeps at
// least half its weight (attendance is in it) and gives the rest to management.
export function hybridScore({ management, execution, share = DEFAULT_MANAGEMENT_SHARE, execTasks = 0 }) {
  if (management === null && execution === null) return { score: null, managementWeight: null, executionWeight: null };
  if (management === null) return { score: round(execution), managementWeight: 0, executionWeight: 100 };
  if (execution === null) return { score: round(management), managementWeight: 100, executionWeight: 0 };
  const exec = (1 - share / 100) * (0.5 + 0.5 * Math.min(1, execTasks / MIN_EXECUTION_TASKS));
  return {
    score: round(management * (1 - exec) + execution * exec),
    managementWeight: round((1 - exec) * 100),
    executionWeight: round(exec * 100),
  };
}
