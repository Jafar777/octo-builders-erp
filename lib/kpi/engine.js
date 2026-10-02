import { bandPoints, indicatorWeight, itemWeight } from "./config.js";

// KPI engine. Pure function: pass everything in, get scores out.
//
// users:      [{ id, department, excluded }]
// attendance: { [userId]: attendance summary }   (lib/attendance.js)
// tasks:      tasks of the month (lean docs) — submitted within the month
// config:     KPI version in force (lib/kpi/config.js)
// ratingTags: settings.tasks.ratingTags
// bonusPool / bonusSplit: top-3 bonus

const id = (v) => (v ? v.toString() : null);
const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
const pct = (part, whole) => (whole ? (part / whole) * 100 : null);
const round = (n, d = 2) => (n === null || n === undefined ? null : Math.round(n * 10 ** d) / 10 ** d);

function measure(userId, ctx) {
  const { tasksBy, attendance, config, tagOf, deptAvg, totalHelp, userDept } = ctx;
  const mine = tasksBy[userId] || [];
  const work = mine.filter((t) => ["task", "revision"].includes(t.kind));
  const reviewed = work.filter((t) => ["approved", "rejected"].includes(t.status));
  const approved = work.filter((t) => t.status === "approved");
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
  const taskHours = mine.reduce((a, t) => a + (t.activeMs || 0), 0) / 3600000;

  return {
    short_hours: att.shortHours ?? null,
    late_count: att.lateCount ?? null,
    warning_count: att.warnings ?? null,
    approved_ratio: dept.approved ? approved.length / dept.approved : approved.length ? 2 : null,
    speed_ratio: myAvgTime && dept.time ? myAvgTime / dept.time : null,
    utilization_pct: att.workedHours ? Math.min(150, pct(taskHours, att.workedHours)) : null,
    on_time_pct: pct(withDue.length - late.length, withDue.length),
    avg_delay_hours: withDue.length
      ? late.length
        ? mean(late.map((t) => (new Date(t.submittedAt) - new Date(t.dueAt)) / 3600000))
        : 0
      : null,
    late_share_pct: pct(late.length, withDue.length),
    first_time_pct: pct(
      reviewed.filter((t) => t.revision === 0 && t.status === "approved").length,
      reviewed.filter((t) => t.revision === 0).length
    ),
    revisions_pct: pct(work.filter((t) => t.kind === "revision").length, work.length),
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
    },
  };
}

export function computeKpi({ users, attendance, tasks, config, ratingTags, bonusPool = 0, bonusSplit = [50, 30, 20] }) {
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
    const score = round((points / maxTotal) * 100, 0);
    const grade = config.grades.find((g) => score >= g.min) || config.grades[config.grades.length - 1];
    return { userId: u.id, department: u.department, score, points, maxTotal, grade: grade?.name || null, indicators, counts: values._counts };
  });

  results.sort((a, b) => b.score - a.score);
  results.forEach((r, i) => {
    r.rank = i + 1;
    r.of = results.length;
    r.bonus = i < bonusSplit.length && bonusPool > 0 && r.score > 0 ? round((bonusPool * bonusSplit[i]) / 100) : 0;
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
