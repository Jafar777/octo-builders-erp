// Earned value per project (pure, no database), measured in working hours, the way
// professional-services ERPs track design work:
//   BAC  budget at completion   planned hours of all the project's work
//   PV   planned value          hours the saved plan (baseline) said should be done by now
//   EV   earned value           planned hours × how far each task really is
//   AC   actual cost            hours actually worked (task timers)
//   SPI = EV / PV  (< 1 behind schedule)    CPI = EV / AC  (< 1 more hours than planned)
// With each person's hourly cost it also gives money: planned, actual and forecast cost.

import { taskProgress } from "./gantt.js";

const HOUR = 3600000;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const time = (d) => (d ? new Date(d).getTime() : NaN);

export const plannedHours = (t) => Number(t.estimatedHours) || Number(t.maxHours) || 0;
export const workedHours = (t, now = Date.now()) => ((t.activeMs || 0) + (t.status === "in_progress" && t.lastResumedAt ? now - time(t.lastResumedAt) : 0)) / HOUR;

// How much of a task the plan expected done at `now`: 0 before its (baseline) start,
// 1 after its end, linear between.
export function plannedFraction(t, now = Date.now()) {
  const start = time(t.baselineStart) || time(t.plannedStart);
  const end = time(t.baselineEnd) || time(t.dueAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  if (now <= start) return 0;
  if (now >= end || end <= start) return 1;
  return (now - start) / (end - start);
}

/**
 * @param tasks  a project's tasks (not sub-tasks): status, estimatedHours / maxHours,
 *               activeMs, lastResumedAt, baselineStart/End, plannedStart, dueAt, assignee
 * @param rates  optional { [assigneeId]: hourly cost in base currency }
 */
export function projectEvm(tasks, now = Date.now(), rates = null) {
  let bac = 0;
  let pv = 0;
  let ev = 0;
  let ac = 0;
  let plannedCost = 0;
  let actualCost = 0;
  let earnedCost = 0;
  for (const t of tasks) {
    if (t.status === "cancelled" || t.parentTask) continue;
    const planned = plannedHours(t);
    const worked = workedHours(t, now);
    const progress = taskProgress(t, now);
    bac += planned;
    pv += planned * plannedFraction(t, now);
    ev += planned * progress;
    ac += worked;
    if (rates) {
      const rate = rates[String(t.assignee)] || 0;
      plannedCost += planned * rate;
      actualCost += worked * rate;
      earnedCost += planned * progress * rate;
    }
  }
  const spi = pv > 0.01 ? r2(ev / pv) : null;
  const cpi = ac > 0.01 ? r2(ev / ac) : null;
  const out = {
    bac: r2(bac),
    pv: r2(pv),
    ev: r2(ev),
    ac: r2(ac),
    spi,
    cpi,
    // Hours the whole project will take if work keeps its current efficiency.
    eac: cpi ? r2(bac / cpi) : r2(Math.max(bac, ac)),
    percentDone: bac ? Math.round((ev / bac) * 100) : 0,
  };
  if (rates) {
    const costCpi = actualCost > 0.01 ? earnedCost / actualCost : null;
    out.money = {
      planned: r2(plannedCost),
      actual: r2(actualCost),
      earned: r2(earnedCost),
      forecast: costCpi ? r2(plannedCost / costCpi) : r2(Math.max(plannedCost, actualCost)),
    };
  }
  return out;
}

// "ok" | "watch" | "bad" for an index (SPI or CPI).
export const evmTone = (v) => (v === null || v === undefined ? "none" : v >= 0.95 ? "ok" : v >= 0.85 ? "watch" : "bad");

/**
 * Utilization: share of each person's available hours spent on project work.
 * @param worked     [{ person, project, hours }] in the period
 * @param available  { [person]: available working hours in the period }
 */
export function utilization(worked, available) {
  const by = {};
  for (const w of worked) {
    const row = (by[w.person] ||= { person: w.person, projectHours: 0, otherHours: 0 });
    if (w.project) row.projectHours += w.hours;
    else row.otherHours += w.hours;
  }
  return Object.keys({ ...available, ...by }).map((person) => {
    const row = by[person] || { person, projectHours: 0, otherHours: 0 };
    const avail = available[person] || 0;
    return {
      person,
      projectHours: r2(row.projectHours),
      otherHours: r2(row.otherHours),
      available: r2(avail),
      utilization: avail ? Math.round((row.projectHours / avail) * 100) : null,
    };
  });
}
