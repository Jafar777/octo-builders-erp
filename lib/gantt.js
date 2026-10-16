// Scheduling maths shared by the Gantt screen and the server: the company working
// calendar, task spans, rescheduling, critical path, workload and progress.
// Pure functions only (no database), so they run in the browser too.

export const HOUR = 3600000;
export const DAY = 24 * HOUR;
export const FINAL_STATUSES = ["approved", "done", "cancelled"];

// ---------- working calendar ----------

const minutes = (hhmm, fallback) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
};

// `settings` = { calendar, workHours, hr } from getSettings(). The result is plain JSON
// so the server can hand it to the browser.
export function makeCalendar(settings) {
  const startMin = minutes(settings.workHours?.workStart, 9 * 60);
  let endMin = minutes(settings.workHours?.workEnd, 17 * 60);
  if (endMin <= startMin) endMin = startMin + 8 * 60;
  return {
    tz: settings.hr?.timezone || "Asia/Damascus",
    weekend: settings.calendar?.weekend || [5],
    holidays: (settings.calendar?.holidays || []).map((h) => (typeof h === "string" ? h : h.date)),
    ramadan: settings.calendar?.ramadan || { start: "", end: "" },
    startMin,
    endMin,
    dailyHours: settings.workHours?.dailyHours || (endMin - startMin) / 60,
    ramadanHours: settings.workHours?.ramadanHours || 0,
  };
}

const formatters = {};
// Offset of `tz` from UTC at instant `ms`.
function offsetMs(ms, tz) {
  const f = (formatters[tz] ||= new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }));
  const p = {};
  for (const part of f.formatToParts(new Date(ms))) p[part.type] = part.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

// "Wall" time: office clock time stored as if it were UTC, so days are plain multiples of DAY.
const toWall = (ms, cal) => ms + offsetMs(ms, cal.tz);
const fromWall = (w, cal) => w - offsetMs(w - offsetMs(w, cal.tz), cal.tz);
const isoOfWall = (w) => new Date(w).toISOString().slice(0, 10);

// A Date whose UTC fields show the office clock (for spreadsheets, which ignore time zones).
export const officeClock = (ms, cal) => new Date(toWall(ms, cal));

// The office date ("YYYY-MM-DD") an instant falls on.
export const officeDate = (ms, cal) => isoOfWall(toWall(ms, cal));

export function isWorkingDate(iso, cal) {
  const weekday = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return !cal.weekend.includes(weekday) && !cal.holidays.includes(iso);
}

// Working window [start, end] of the wall day starting at `dayW`, or null.
function dayWindow(dayW, cal) {
  const iso = isoOfWall(dayW);
  if (!isWorkingDate(iso, cal)) return null;
  const start = dayW + cal.startMin * 60000;
  let end = dayW + cal.endMin * 60000;
  const r = cal.ramadan;
  if (r?.start && r?.end && iso >= r.start && iso <= r.end && cal.ramadanHours) end = Math.min(end, start + cal.ramadanHours * HOUR);
  return [start, end];
}

const MAX_DAYS = 3 * 366;

// First working instant at or after `ms`.
export function nextWorkMoment(ms, cal) {
  let w = toWall(ms, cal);
  for (let i = 0; i < MAX_DAYS; i += 1) {
    const day = Math.floor(w / DAY) * DAY;
    const win = dayWindow(day, cal);
    if (win && w < win[1]) return fromWall(Math.max(w, win[0]), cal);
    w = day + DAY;
  }
  return ms;
}

// Last working instant at or before `ms` (where a task should end).
export function prevWorkEnd(ms, cal) {
  let w = toWall(ms, cal);
  for (let i = 0; i < MAX_DAYS; i += 1) {
    const day = Math.floor(w / DAY) * DAY;
    const win = dayWindow(day, cal);
    if (win && w > win[0]) return fromWall(Math.min(w, win[1]), cal);
    w = day - 1;
  }
  return ms;
}

// The instant `hours` of working time after `ms`.
export function addWorkHours(ms, hours, cal) {
  let w = toWall(nextWorkMoment(ms, cal), cal);
  let left = Math.max(0, hours) * HOUR;
  for (let i = 0; i < MAX_DAYS; i += 1) {
    const day = Math.floor(w / DAY) * DAY;
    const win = dayWindow(day, cal);
    if (win && w < win[1]) {
      const from = Math.max(w, win[0]);
      if (left <= win[1] - from) return fromWall(from + left, cal);
      left -= win[1] - from;
    }
    w = day + DAY;
  }
  return ms + hours * HOUR;
}

// Working time between two instants, in ms.
export function workMsBetween(a, b, cal) {
  if (b <= a) return 0;
  const wa = toWall(a, cal);
  const wb = toWall(b, cal);
  let total = 0;
  for (let day = Math.floor(wa / DAY) * DAY, i = 0; day < wb && i < MAX_DAYS; day += DAY, i += 1) {
    const win = dayWindow(day, cal);
    if (win) total += Math.max(0, Math.min(win[1], wb) - Math.max(win[0], wa));
  }
  return total;
}

// Opening → closing time of every working day between two instants:
// [{ iso: "2026-10-18", start, end }] (instants). Days off are left out.
export function workWindows(a, b, cal) {
  const out = [];
  const wb = toWall(b, cal);
  for (let day = Math.floor(toWall(a, cal) / DAY) * DAY, i = 0; day < wb && i < MAX_DAYS; day += DAY, i += 1) {
    const win = dayWindow(day, cal);
    if (win) out.push({ iso: isoOfWall(day), start: fromWall(win[0], cal), end: fromWall(win[1], cal) });
  }
  return out;
}

// Working hours per office date between two instants: { "2026-10-18": 3.5, ... }.
export function workHoursByDate(a, b, cal) {
  const out = {};
  if (b <= a) return out;
  const wa = toWall(a, cal);
  const wb = toWall(b, cal);
  for (let day = Math.floor(wa / DAY) * DAY, i = 0; day < wb && i < MAX_DAYS; day += DAY, i += 1) {
    const win = dayWindow(day, cal);
    if (!win) continue;
    const ms = Math.min(win[1], wb) - Math.max(win[0], wa);
    if (ms > 0) out[isoOfWall(day)] = ms / HOUR;
  }
  return out;
}

// Moves a task so it starts at the first working moment at/after `start`, keeping
// its working length.
export function placeTask(start, workMs, cal) {
  const s = nextWorkMoment(start, cal);
  return { start: s, end: addWorkHours(s, Math.max(workMs, HOUR) / HOUR, cal) };
}

// ---------- tasks ----------

const time = (d) => (d ? new Date(d).getTime() : null);

// Where a task sits on the timeline. Tasks without a planned start begin when they
// were started (or created); tasks without a due date last their estimate.
export function taskSpan(task) {
  const length = Math.max(task.estimatedHours || 0, 1) * HOUR;
  let end = time(task.dueAt);
  let start = time(task.plannedStart) ?? time(task.startedAt) ?? time(task.createdAt) ?? Date.now();
  if (end == null) end = start + length;
  if (start > end) start = end - Math.max(length, 4 * HOUR);
  return { start, end, unscheduled: !task.plannedStart };
}

// When a predecessor really frees its successors.
export function finishTime(task) {
  if (FINAL_STATUSES.includes(task.status) && task.submittedAt) return time(task.submittedAt);
  return taskSpan(task).end;
}

// 0–1. Finished = 1; otherwise sub-tasks done, else time worked against the estimate.
export function taskProgress(task, now = Date.now()) {
  if (["approved", "done"].includes(task.status)) return 1;
  if (task.status === "submitted") return 0.9;
  if (task.status === "todo" || task.status === "cancelled") return 0;
  if (task.subtasks?.total) return Math.min(0.95, task.subtasks.done / task.subtasks.total);
  if (!task.estimatedHours) return 0.1;
  const live = (task.activeMs || 0) + (task.lastResumedAt ? now - time(task.lastResumedAt) : 0);
  return Math.max(0.05, Math.min(0.95, live / (task.estimatedHours * HOUR)));
}

// A milestone is at risk when a task it waits for ends after it, and late once its
// date has passed without being reached. "done" | "late" | "risk" | "ok".
export function milestoneState(m, tasksById, now = Date.now()) {
  if (m.doneAt) return "done";
  const at = new Date(m.date).getTime();
  if (at < now) return "late";
  if ((m.dependsOn || []).some((id) => tasksById[id] && finishTime(tasksById[id]) > at)) return "risk";
  return "ok";
}

// Task ids on each project's critical path: the chain with no slack between the
// tasks and the project's last finish (or a milestone). `tasks` = [{ id, span,
// dependsOn: [id], status }], `milestones` = [{ id, date, dependsOn: [id] }].
export function criticalPath(tasks, milestones = []) {
  const live = tasks.filter((t) => t.status !== "cancelled");
  if (!live.length) return new Set();
  const byId = new Map(live.map((t) => [t.id, t]));
  const successors = new Map(live.map((t) => [t.id, []]));
  for (const t of live) for (const d of t.dependsOn) successors.get(d)?.push(t.id);
  // Milestones are zero-length tasks that wait for their predecessors.
  const nodes = new Map(live.map((t) => [t.id, { start: t.span.start, end: t.span.end }]));
  for (const m of milestones) {
    const at = new Date(m.date).getTime();
    nodes.set(`m:${m.id}`, { start: at, end: at });
    successors.set(`m:${m.id}`, []);
    for (const d of m.dependsOn || []) successors.get(d)?.push(`m:${m.id}`);
  }
  const projectEnd = Math.max(...[...nodes.values()].map((n) => n.end));

  const lateFinish = new Map();
  const lf = (id, depth = 0) => {
    if (lateFinish.has(id)) return lateFinish.get(id);
    const next = successors.get(id) || [];
    let value = projectEnd;
    if (depth < 500) for (const s of next) value = Math.min(value, lf(s, depth + 1) - (nodes.get(s).end - nodes.get(s).start));
    lateFinish.set(id, value);
    return value;
  };
  const out = new Set();
  for (const id of byId.keys()) if (lf(id) - nodes.get(id).end < HOUR) out.add(id);
  return out;
}

// Planned hours per person per office date for open tasks:
// { [personId]: { "2026-10-18": 6, ... } }. Tasks without an estimate count their
// whole working length.
export function workload(tasks, cal) {
  const out = {};
  for (const task of tasks) {
    if (!task.assignee || FINAL_STATUSES.includes(task.status) || task.status === "submitted") continue;
    const { start, end } = taskSpan(task);
    const days = workHoursByDate(start, end, cal);
    const total = Object.values(days).reduce((a, b) => a + b, 0);
    if (!total) continue;
    const hours = task.estimatedHours > 0 ? task.estimatedHours : total;
    const mine = (out[task.assignee.id] ||= {});
    for (const [date, h] of Object.entries(days)) mine[date] = (mine[date] || 0) + (h / total) * hours;
  }
  return out;
}
