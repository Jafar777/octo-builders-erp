import { bandPoints, indicatorWeight, itemWeight } from "./config.js";
import { DEFAULT_MANAGEMENT_SHARE, DEFAULT_RATING_WEIGHT, DEFAULT_TEAM_WEIGHTS, hybridScore, managementScore, measuredShare, teamMetrics } from "./hybrid.js";

// KPI engine. Pure function: pass everything in, get scores out.
//
// users:      [{ id, department, excluded }]
// attendance: { [userId]: attendance summary }   (lib/attendance.js)
// tasks:      tasks of the month (lean docs) — handed in within the month, plus tasks
//             the GM / CEO cancelled within the month after work started (their time counts)
// config:     KPI version in force (lib/kpi/config.js)
// ratingTags: settings.tasks.ratingTags
// bonusPool / bonusSplit: top-3 bonus

const id = (v) => (v ? v.toString() : null);
const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
const pct = (part, whole) => (whole ? (part / whole) * 100 : null);
const round = (n, d = 2) => (n === null || n === undefined ? null : Math.round(n * 10 ** d) / 10 ** d);
const HOUR = 3600000;

// Accepted by the team: approved, or every internal review passed and only the
// customer's is left (their review can come after the month closes).
export const accepted = (t) => t.status === "approved" || (t.status === "submitted" && t.reviewLevel === "customer");
// Rejections and redos count against the employee only when they caused them, not a
// management decision, the project's nature or the customer's change of mind.
export const ownFault = (cause) => !cause || cause === "employee";
// Hours a task adds to the employee's month: handed-in work its planned hours (else the
// time tracked), cancelled work the time actually spent on it.
export function creditHours(t) {
  if (t.status === "cancelled") return (t.activeMs || 0) / HOUR;
  if (!["approved", "done", "submitted"].includes(t.status)) return 0;
  return t.maxHours || t.estimatedHours || (t.activeMs || 0) / HOUR;
}

function measure(userId, ctx) {
  const { tasksBy, attendance, config, tagOf, deptAvg, totalHelp, userDept } = ctx;
  const mine = tasksBy[userId] || [];
  const work = mine.filter((t) => ["task", "revision"].includes(t.kind) && t.status !== "cancelled");
  // Rejections the employee didn't cause are left out (neither for nor against them).
  const reviewed = work.filter((t) => accepted(t) || (t.status === "rejected" && ownFault(t.rejectCause)));
  const approved = work.filter(accepted);
  const withDue = work.filter((t) => t.dueAt);
  const late = withDue.filter((t) => new Date(t.submittedAt) > new Date(t.dueAt));
  const att = attendance[userId] || {};
  const dept = deptAvg[userDept[userId]] || {};

  const tags = reviewed.flatMap((t) => (t.ratings || []).map(tagOf).filter(Boolean));
  const skillPct = (skills) => {
    if (!reviewed.length) return null;
    const exc = tags.filter((g) => g.kind === "excellent" && skills.includes(g.skill)).length;
    const err = tags.filter((g) => g.kind === "error" && skills.includes(g.skill)).length;
    return Math.max(0, ((exc - err) / reviewed.length) * 100);
  };

  const myAvgTime = mean(approved.map((t) => t.activeMs));
  // Actual hours: finished tasks count their scale / estimated hours (see lib/hr taskCreditHours).
  const taskHours = mine.filter((t) => ["task", "revision", "help", "meeting"].includes(t.kind)).reduce((a, t) => a + creditHours(t), 0);
  const firstReviewed = reviewed.filter((t) => t.revision === 0);
  const firstApproved = firstReviewed.filter(accepted);

  return {
    short_hours: att.shortHours ?? null,
    late_count: att.lateCount ?? null,
    warning_count: att.warnings ?? null,
    approved_ratio: dept.approved ? approved.length / dept.approved : approved.length ? 2 : null,
    speed_ratio: myAvgTime && dept.time ? myAvgTime / dept.time : null,
    // Sick days count as full days on both sides (see lib/attendance sickHours).
    utilization_pct: att.workedHours ? Math.min(150, pct(taskHours + (att.sickHours || 0), att.workedHours)) : null,
    on_time_pct: pct(withDue.length - late.length, withDue.length),
    avg_delay_hours: withDue.length
      ? late.length
        ? mean(late.map((t) => (new Date(t.submittedAt) - new Date(t.dueAt)) / 3600000))
        : 0
      : null,
    late_share_pct: pct(late.length, withDue.length),
    first_time_pct: pct(firstApproved.length, firstReviewed.length),
    revisions_pct: pct(work.filter((t) => t.kind === "revision" && ownFault(t.revisionCause)).length, work.length),
    rejection_pct: pct(reviewed.filter((t) => t.status === "rejected").length, reviewed.length),
    help_count: ctx.helpBy[userId] || 0,
    contribution_share_pct: totalHelp ? pct(ctx.helpBy[userId] || 0, totalHelp) : 0,
    advanced_skills: new Set(mine.map((t) => t.type).filter((type) => config.advancedTypes.includes(type))).size,
    design_skill_pct: skillPct(config.designSkills),
    software_skill_pct: skillPct(config.softwareSkills),
    _counts: {
      tasks: work.length,
      approved: approved.length,
      reviewed: reviewed.length,
      late: late.length,
      byType: work.reduce((acc, t) => ({ ...acc, [t.type || "other"]: (acc[t.type || "other"] || 0) + 1 }), {}),
      avgTaskHours: round(myAvgTime ? myAvgTime / 3600000 : null),
      // For the department head's team metrics (lib/kpi/hybrid).
      handedIn: withDue.length,
      firstReviewed: firstReviewed.length,
      firstApproved: firstApproved.length,
      taskHours: round(taskHours),
      workedHours: att.workedHours || 0,
    },
  };
}

// Department managers get the hybrid KPI (lib/kpi/hybrid): their system score is the
// execution part, their team's results and the GM / CEO rating the management part.
// managers:     { userId: { share } } (share = management %, null = the default)
// manualScores: { userId: 0–100 } the GM / CEO rating of department managers
// hybrid:       { share, ratingWeight, teamWeights } company defaults (settings.managerKpi)
export function computeKpi({ users, attendance, tasks, config, ratingTags, bonusPool = 0, bonusSplit = [50, 30, 20], bonusMinScore = 0, manualScores = {}, managers = {}, hybrid = {} }) {
  const included = users.filter((u) => !u.excluded);
  const userDept = Object.fromEntries(users.map((u) => [u.id, u.department || "none"]));
  const tagMap = Object.fromEntries(ratingTags.map((r) => [r.key, r]));
  const tagOf = (key) => tagMap[key];

  const tasksBy = {};
  for (const t of tasks) (tasksBy[id(t.assignee)] ||= []).push(t);

  // Help: finished help tasks + "helped a colleague" ratings received.
  const helpBy = {};
  for (const t of tasks) {
    const uid = id(t.assignee);
    if (t.kind === "help" && ["approved", "done", "submitted"].includes(t.status)) helpBy[uid] = (helpBy[uid] || 0) + 1;
    for (const r of t.ratings || []) if (tagOf(r)?.kind === "contribution") helpBy[uid] = (helpBy[uid] || 0) + 1;
  }
  const totalHelp = included.reduce((a, u) => a + (helpBy[u.id] || 0), 0);

  // Department averages for the relative metrics.
  const deptAvg = {};
  for (const dep of new Set(included.map((u) => userDept[u.id]))) {
    const members = included.filter((u) => userDept[u.id] === dep);
    const approvedCounts = members.map((u) => (tasksBy[u.id] || []).filter((t) => ["task", "revision"].includes(t.kind) && t.status === "approved"));
    deptAvg[dep] = {
      approved: mean(approvedCounts.map((l) => l.length)),
      time: mean(approvedCounts.flat().map((t) => t.activeMs).filter(Boolean)),
    };
  }

  const ctx = { tasksBy, attendance, config, tagOf, deptAvg, totalHelp, helpBy, userDept };
  const maxTotal = config.indicators.reduce((a, ind) => a + indicatorWeight(ind), 0) || 1;

  const results = included.map((u) => {
    const values = measure(u.id, ctx);
    const indicators = config.indicators.map((ind) => {
      const items = ind.items.map((item) => {
        const value = values[item.metric];
        return {
          key: item.key,
          name: item.name,
          metric: item.metric,
          value: round(value),
          points: bandPoints(item.bands, value),
          max: itemWeight(item),
        };
      });
      const points = items.reduce((a, i) => a + i.points, 0);
      const max = indicatorWeight(ind);
      return { key: ind.key, name: ind.name, points, max, percent: max ? round((points / max) * 100, 0) : 0, items };
    });
    const points = indicators.reduce((a, i) => a + i.points, 0);
    const systemScore = round((points / maxTotal) * 100, 0);
    return { userId: u.id, department: u.department, score: systemScore, systemScore, manualScore: null, points, maxTotal, indicators, counts: values._counts };
  });

  // Department heads: management (their team) x share + execution (their own score).
  const teamWeights = { ...DEFAULT_TEAM_WEIGHTS, ...(hybrid.teamWeights || {}) };
  const ratingWeight = hybrid.ratingWeight ?? DEFAULT_RATING_WEIGHT;
  const isManager = (r) => Boolean(managers[r.userId]);
  for (const r of results.filter(isManager)) {
    const team = results.filter((m) => !isManager(m) && userDept[m.userId] === userDept[r.userId]);
    // How fast they reviewed this month's handed-in work (hours from hand-in).
    const reviewHours = [];
    for (const t of tasks) {
      const reviews = t.reviews?.length ? t.reviews : t.reviewedBy ? [{ by: t.reviewedBy, at: t.reviewedAt }] : [];
      for (const rev of reviews) {
        if (id(rev.by) === r.userId && rev.at && t.submittedAt) reviewHours.push(Math.max(0, (new Date(rev.at) - new Date(t.submittedAt)) / HOUR));
      }
    }
    const metrics = teamMetrics(team, reviewHours);
    const rating = manualScores[r.userId] ?? null;
    const management = managementScore(metrics, teamWeights, rating, ratingWeight);
    const share = managers[r.userId].share ?? hybrid.share ?? DEFAULT_MANAGEMENT_SHARE;
    const final = hybridScore({ management: management.score, execution: r.systemScore, share, execTasks: r.counts.tasks });
    r.manualScore = rating;
    r.score = final.score ?? r.systemScore;
    r.hybrid = {
      share,
      measuredShare: measuredShare(r.counts.taskHours, r.counts.workedHours),
      management: management.score,
      teamScore: management.team,
      metrics,
      rating,
      ratingWeight,
      execution: r.systemScore,
      managementWeight: final.managementWeight,
      executionWeight: final.executionWeight,
      teamSize: team.length,
    };
  }
  for (const r of results) {
    const grade = config.grades.find((g) => r.score >= g.min) || config.grades[config.grades.length - 1];
    r.grade = grade?.name || null;
  }

  results.sort((a, b) => b.score - a.score);
  results.forEach((r, i) => {
    r.rank = i + 1;
    r.of = results.length;
    r.bonus = i < bonusSplit.length && bonusPool > 0 && r.score > 0 && r.score >= bonusMinScore ? round((bonusPool * bonusSplit[i]) / 100) : 0;
  });

  // Department averages per indicator (for the manager view).
  const departments = {};
  for (const r of results) {
    const d = (departments[r.department || "none"] ||= { count: 0, score: 0, indicators: {} });
    d.count += 1;
    d.score += r.score;
    for (const ind of r.indicators) d.indicators[ind.key] = (d.indicators[ind.key] || 0) + ind.percent;
  }
  for (const d of Object.values(departments)) {
    d.score = round(d.score / d.count, 0);
    for (const k of Object.keys(d.indicators)) d.indicators[k] = round(d.indicators[k] / d.count, 0);
  }

  return { results, departments, target: config.target };
}
