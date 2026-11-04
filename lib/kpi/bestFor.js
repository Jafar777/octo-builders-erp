import { accepted, ownFault } from "./engine.js";

// Who is best at a task type, from the same KPI signals the monthly score uses,
// compared across every employee who did that type of work. Pure function.
//
// tasks:      past task / revision tasks of one type (lean docs, any assignee)
// ratingTags: settings.tasks.ratingTags
// Returns the ranking (best first), each { userId, score, tasks, firstTimePct, onTimePct, speedPct }.
//
// score (0–100) = first-time approval 35 + on time 25 + speed vs everyone 20 + ratings 20.
// Parts without data are left out and the rest re-weighted.

export const MIN_TASKS = 3;
const WEIGHTS = { quality: 35, onTime: 25, speed: 20, ratings: 20 };

const id = (v) => (v ? v.toString() : null);
const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
const clamp = (n) => Math.max(0, Math.min(100, n));

export function rankForType(tasks, ratingTags = [], { minTasks = MIN_TASKS } = {}) {
  const tagKind = Object.fromEntries(ratingTags.map((r) => [r.key, r.kind]));
  const work = tasks.filter((t) => ["task", "revision"].includes(t.kind || "task") && t.status !== "cancelled");
  // Only work that was reviewed; rejections the employee didn't cause are left out.
  const reviewed = work.filter((t) => accepted(t) || (t.status === "rejected" && ownFault(t.rejectCause)));

  const by = {};
  for (const t of reviewed) (by[id(t.assignee)] ||= []).push(t);
  const overallTime = mean(reviewed.filter(accepted).map((t) => t.activeMs).filter((ms) => ms > 0));

  const ranking = [];
  for (const [userId, mine] of Object.entries(by)) {
    if (!userId || mine.length < minTasks) continue;
    const first = mine.filter((t) => !t.revision);
    const withDue = mine.filter((t) => t.dueAt && t.submittedAt);
    const onTime = withDue.filter((t) => new Date(t.submittedAt) <= new Date(t.dueAt));
    const myTime = mean(mine.filter(accepted).map((t) => t.activeMs).filter((ms) => ms > 0));
    const tags = mine.flatMap((t) => t.ratings || []).map((k) => tagKind[k]);
    const exc = tags.filter((k) => k === "excellent").length;
    const err = tags.filter((k) => k === "error").length;

    const parts = {
      quality: first.length ? (first.filter(accepted).length / first.length) * 100 : null,
      onTime: withDue.length ? (onTime.length / withDue.length) * 100 : null,
      // Average time = 50; half the everyone-average = 100; 1.5× = 0.
      speed: myTime && overallTime ? clamp(150 - (myTime / overallTime) * 100) : null,
      // No tags = 50; every task tagged excellent = 100; every task an error = 0.
      ratings: clamp(50 + ((exc - err) / mine.length) * 50),
    };
    const keys = Object.keys(WEIGHTS).filter((k) => parts[k] !== null);
    const total = keys.reduce((n, k) => n + WEIGHTS[k], 0);
    const score = total ? keys.reduce((n, k) => n + parts[k] * WEIGHTS[k], 0) / total : 0;
    ranking.push({
      userId,
      score: Math.round(score),
      tasks: mine.length,
      firstTimePct: parts.quality === null ? null : Math.round(parts.quality),
      onTimePct: parts.onTime === null ? null : Math.round(parts.onTime),
      // How much faster (+) or slower (−) than the average, in %.
      speedPct: myTime && overallTime ? Math.round((1 - myTime / overallTime) * 100) : null,
    });
  }
  // Ties: more tasks of this type wins.
  return ranking.sort((a, b) => b.score - a.score || b.tasks - a.tasks);
}

// Score points the best must be ahead of the next employee to be named.
export const LEAD_MARGIN = 5;

// The best of a ranking, only when they clearly stand out: at least two employees
// compared and the first `margin` points ahead of the second. Else null.
export function clearLeader(ranking, { margin = LEAD_MARGIN } = {}) {
  if (ranking.length < 2) return null;
  const [first, second] = ranking;
  if (first.score - second.score < margin) return null;
  return { ...first, lead: first.score - second.score, compared: ranking.length };
}
