// Scheduling maths shared by the Gantt screen and the server: the company working
// calendar, task spans, rescheduling, critical path, workload and progress.
// Pure functions only (no database), so they run in the browser too.

import { daySchedule, weekdayHours } from "./workDays.js";
// The Gantt timeline (projects page and /api/work-projects/timeline), set on the Roles
// page: gantt.view sees it — company-wide with scope "all", only their departments'
// work below that — and gantt.edit (company-wide only) schedules it.
const has = (user, p) => Boolean(user?.permissions?.includes(p));
export function canSeeGantt(user) {
  return Boolean(user?.isStaff && !user.limited && (has(user, "gantt.view") || canEditGantt(user)));
}
export function canEditGantt(user) {
  return Boolean(user?.isStaff && !user.limited && user.scope === "all" && has(user, "gantt.edit") && has(user, "projects.manage"));
}
// Sees only their departments' work on it.
export const isGanttDeptManager = (user) => canSeeGantt(user) && user.scope !== "all";

export const HOUR = 3600000;
export const DAY = 24 * HOUR;
export const FINAL_STATUSES = ["approved", "done", "cancelled"];

// ---------- working calendar ----------

// `settings` = { calendar, workHours, hr } from getSettings(). The result is plain JSON
// so the server can hand it to the browser. Each weekday has its own hours, and
// special days override single dates (Settings → Working hours).
export function makeCalendar(settings) {
  const wh = settings.workHours || {};
  return {
    tz: settings.hr?.timezone || "Asia/Damascus",
    weekend: settings.calendar?.weekend || [5],
    holidays: (settings.calendar?.holidays || []).map((h) => (typeof h === "string" ? h : h.date)),
    ramadan: settings.calendar?.ramadan || { start: "", end: "" },
    days: Array.from({ length: 7 }, (_, wd) => weekdayHours(wh, wd)),
    special: (wh.special || []).map((s) => ({ date: s.date, start: s.start, end: s.end, hours: s.hours })),
    ramadanHours: wh.ramadanHours || 0,
  };
}

const scheduleOf = (iso, cal) => daySchedule(iso, cal, { days: cal.days, special: cal.special, ramadanHours: cal.ramadanHours });

// Working hours that count on an office date.
export const dateHours = (iso, cal) => scheduleOf(iso, cal).hours;

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
  return scheduleOf(iso, cal).working;
}

// Working window [start, end] of the wall day starting at `dayW`, or null. A day that
// counts fewer hours than its opening times (Ramadan, a short day) ends early.
function dayWindow(dayW, cal) {
  const day = scheduleOf(isoOfWall(dayW), cal);
  if (!day.working) return null;
  const start = dayW + day.startMin * 60000;
  const end = Math.min(dayW + day.endMin * 60000, start + day.hours * HOUR);
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

// Where a task sits on the timeline. Not-started tasks show their plan. Once work
// starts the bar shows what happened: it begins at the actual start and, once handed
// in, ends at the hand-in. Tasks without a planned start begin when they were created;
// tasks without a due date last their estimate.
export function taskSpan(task) {
  const length = Math.max(task.estimatedHours || 0, 1) * HOUR;
  let end = time(task.dueAt);
  let start = time(task.plannedStart) ?? time(task.startedAt) ?? time(task.createdAt) ?? Date.now();
  const startedAt = task.status !== "todo" ? time(task.startedAt) : null;
  if (startedAt != null) start = startedAt;
  const handedIn = ["submitted", "approved", "done", "rejected"].includes(task.status) ? time(task.submittedAt) : null;
  if (handedIn != null) end = handedIn;
  // Cancelled after work started: the bar shows the time actually spent.
  const cancelledAt = task.status === "cancelled" && startedAt != null ? time(task.cancelledAt) : null;
  if (cancelledAt != null) end = Math.max(cancelledAt, startedAt);
  if (end == null) end = start + length;
  // Started after its due time: it lasts its estimate from the start (the overrun shows separately).
  if (start > end) {
    if (startedAt != null) end = start + length;
    else start = end - Math.max(length, 4 * HOUR);
  }
  return { start, end, unscheduled: !task.plannedStart };
}

// The states a bar shows on the Gantt: "done" (accepted by the CEO / department
// manager), "rejected" (its redo R-01… gets its own bar), "ongoing" (the employee started
// it: working, paused, asking for help or waiting for review), "scheduled" (not started)
// or "cancelled" (kept on the plan, greyed out, like an inactive task in MS Project).
export const BAR_STATES = ["scheduled", "ongoing", "done", "rejected", "cancelled"];
const ONGOING = ["in_progress", "on_hold", "help", "submitted"];
export function barState(task) {
  if (["approved", "done"].includes(task.status)) return "done";
  if (task.status === "rejected") return "rejected";
  if (task.status === "cancelled") return "cancelled";
  if (ONGOING.includes(task.status)) return "ongoing";
  return "scheduled";
}
export const BAR_HEX = { done: "#10b981", scheduled: "#3b82f6", ongoing: "#f97316", rejected: "#ef4444", cancelled: "#64748b" };
export const BAR_ICON = { done: "✅", scheduled: "🕐", ongoing: "⏳", rejected: "❌", cancelled: "⊘" };

// Only tasks nobody has started can be moved on the chart: once work starts, the bar
// records what happened.
export const canMoveTask = (task) => task.status === "todo";

// A start pressed by mistake can be undone for a short while: the task goes back to
// its plan as if it never started.
export const UNDO_START_MS = 15 * 60000;
export const canUndoStart = (task, now = Date.now()) =>
  ["in_progress", "on_hold"].includes(task.status) && !!task.startedAt && now - time(task.startedAt) <= UNDO_START_MS;

// The employee cancels their own meetings and personal tasks; project work is
// cancelled by the GM / CEO (the employee asks, with a reason).
export const cancelNeedsApproval = (task) => Boolean(task.project) && !["meeting", "personal"].includes(task.kind);

// One employee never has two tasks at the same time. Every dated task they haven't
// finished holds its time on their schedule (meetings don't).
export const HOLDING_STATUSES = ["todo", "in_progress", "on_hold", "help"];
export const holdsTime = (task) => HOLDING_STATUSES.includes(task.status) && task.kind !== "meeting" && !!task.plannedStart && !!task.dueAt;
// Meetings still take the employee's time: other work is planned around them (they
// never move for it), they just don't count as "the one task" being worked on.
export const takesTime = (task) => HOLDING_STATUSES.includes(task.status) && !!task.plannedStart && !!task.dueAt;

// First instant of an office date ("YYYY-MM-DD") and of the day after: a day of leave
// as a span the plan keeps free.
export function officeDaySpan(iso, cal) {
  const w = Date.parse(`${iso}T00:00:00Z`);
  return { start: fromWall(w, cal), end: fromWall(w + DAY, cal) };
}

// The first of `others` whose time overlaps `span` ({ start, end } in ms), or null.
export function overlapping(span, others) {
  return (
    others.find((o) => {
      const s = heldSpan(o);
      return s.start < span.end && span.start < s.end;
    }) || null
  );
}

// The time a task holds on the plan: its bar, stretched to `expectedEnd` while it
// runs past its due time. Handed-in work ends at its hand-in (an old expected finish
// no longer counts).
export function heldSpan(task) {
  const span = taskSpan(task);
  const late = HOLDING_STATUSES.includes(task.status) ? time(task.expectedEnd) : null;
  return late && late > span.end ? { ...span, end: late } : span;
}

// Priority of a task when tasks compete for the same time: a redo of rejected work
// first, then urgent > important > normal.
const RANK = { normal: 0, important: 1, urgent: 2, redo: 3 };

// Working length of a task: its hours when it has them (they follow its planned time),
// else the working time its bar covers. A task planned before its employee's leave was
// known keeps its hours when it moves around that leave.
export const taskWorkMs = (task, cal, span = taskSpan(task)) =>
  task.estimatedHours > 0 ? task.estimatedHours * HOUR : workMsBetween(span.start, span.end, cal) || HOUR;

// A redo of rejected work (R-01, R-02…): its revision number counts up from 0.
export const isRedo = (task) => task.revision > 0;
const hit = (a, b) => a.start < b.end && b.start < a.end;

// The first slot of `workMs` working time at/after `from` that overlaps none of `spans`.
export function gapFrom(from, workMs, spans, cal) {
  let slot = placeTask(from, workMs, cal);
  for (let i = 0; i < 500; i += 1) {
    const blocking = spans.filter((s) => hit(s, slot));
    if (!blocking.length) break;
    slot = placeTask(Math.max(...blocking.map((s) => s.end)), workMs, cal);
  }
  return slot;
}

// Free working time in [from, to) that none of `taken` covers: [{ start, end, ms }]
// (ms = working time). A gap that runs across closing time or days off stays one gap;
// gaps shorter than `minMs` are left out.
export function freeGaps(taken, from, to, cal, minMs = HOUR) {
  const busy = taken.filter((s) => s.end > from && s.start < to).sort((a, b) => a.start - b.start);
  const out = [];
  const add = (a, b) => {
    const last = out.at(-1);
    if (last && workMsBetween(last.end, a, cal) === 0) {
      last.end = b;
      last.ms += b - a;
    } else out.push({ start: a, end: b, ms: b - a });
  };
  for (const w of workWindows(from, to, cal)) {
    let at = Math.max(w.start, from);
    const end = Math.min(w.end, to);
    for (const s of busy) {
      if (s.end <= at || s.start >= end) continue;
      if (s.start > at) add(at, s.start);
      at = Math.max(at, s.end);
    }
    if (at < end) add(at, end);
  }
  return out.filter((g) => g.ms >= minMs);
}

// One employee's schedule without overlaps. `started` = spans of work already going
// (they stay put); `waiting` = [{ id, span, priority, workMs? }] not-started tasks ("redo"
// for redos of rejected work, which outrank everything; `workMs` = its working length,
// else the working time its span covers). A waiting task
// that overlaps other work goes into the first free gap after it, keeping its working
// length; it may take the place of a waiting task of lower priority, which is then
// re-placed later. Equal priorities keep their order. Returns Map(id → new span) of the
// tasks it placed (some may end up where they were).
export function untangle(started, waiting, cal) {
  const placed = started.map((span) => ({ span, rank: Infinity, item: null }));
  const queue = waiting.map((w) => ({ ...w, rank: RANK[w.priority] ?? 0 }));
  const out = new Map();
  for (let guard = 0; queue.length && guard < 2000; guard += 1) {
    queue.sort((a, b) => a.span.start - b.span.start);
    const item = queue.shift();
    if (!placed.some((p) => hit(p.span, item.span))) {
      placed.push({ span: item.span, rank: item.rank, item });
      continue;
    }
    const length = item.workMs || workMsBetween(item.span.start, item.span.end, cal) || HOUR;
    // Lower-priority waiting work doesn't block it; whatever it lands on is re-placed.
    const solid = placed.filter((p) => !(p.item && p.rank < item.rank)).map((p) => p.span);
    const slot = gapFrom(item.span.start, length, solid, cal);
    for (const p of placed.filter((x) => x.item && hit(x.span, slot))) {
      placed.splice(placed.indexOf(p), 1);
      queue.push(p.item);
    }
    item.span = slot;
    out.set(item.id, slot);
    placed.push({ span: slot, rank: item.rank, item });
  }
  return out;
}

// When a task is (or is expected to be) finished: handed in work counts from the
// moment it was submitted, the rest when its held time ends.
export function finishTime(task) {
  if (["submitted", ...FINAL_STATUSES].includes(task.status) && task.submittedAt) return time(task.submittedAt);
  return heldSpan(task).end;
}

// ---------- external review (another office checks the work) ----------
// A task with externalReview.hours: after it's handed in, the work goes to another
// office. The tasks waiting for it can't start until the review comes back; nobody's
// time is held meanwhile (it isn't part of heldSpan), so the employees take other work.

const DELIVERED = ["submitted", "approved", "done"];
export const externalHours = (task) => (task?.status !== "cancelled" && task?.externalReview?.hours > 0 ? task.externalReview.hours : 0);
// Handed in, sent out, and the review hasn't come back yet.
export const awaitingExternal = (task) => externalHours(task) > 0 && !task.externalReview.receivedAt && DELIVERED.includes(task.status);

// When the tasks waiting for `task` can start: when it's finished, plus the external
// review's working hours. A review marked received ends the wait then; one that's
// late (handed in, the time is up, nothing back) keeps them waiting until now at least.
export function readyTime(task, cal, now = Date.now()) {
  const end = finishTime(task);
  const hours = externalHours(task);
  if (!hours) return end;
  if (task.externalReview.receivedAt) return Math.max(end, time(task.externalReview.receivedAt));
  const planned = cal ? addWorkHours(end, hours, cal) : end + hours * HOUR;
  return awaitingExternal(task) ? Math.max(planned, now) : planned;
}

// The external review on the chart: { start, end, planned, late, received } or null.
export function externalSpan(task, cal, now = Date.now()) {
  const hours = externalHours(task);
  if (!hours) return null;
  const start = finishTime(task);
  const planned = cal ? addWorkHours(start, hours, cal) : start + hours * HOUR;
  const received = task.externalReview.receivedAt ? time(task.externalReview.receivedAt) : null;
  const end = readyTime(task, cal, now);
  return { start, end, planned, received, late: !received && awaitingExternal(task) && now > planned };
}

// 0–1. Finished = 1; otherwise sub-tasks done, else time worked against the estimate.
export function taskProgress(task, now = Date.now()) {
  if (["approved", "done"].includes(task.status)) return 1;
  if (task.status === "submitted") return 0.9;
  if (task.status === "todo" || task.status === "cancelled") return 0;
  if (task.subtasks?.total) return Math.min(0.95, task.subtasks.done / task.subtasks.total);
  // A checklist: the share of its steps ticked off.
  const steps = task.checklist?.length || 0;
  if (steps) return Math.max(0.05, Math.min(0.95, task.checklist.filter((c) => c.done).length / steps));
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

// The tasks that set each project's delivery — its critical path, the way a Gantt
// tool's "driving path" finds it. It follows the tasks' dependencies and each
// employee's queue, because here work usually waits for its employee to finish
// something else (often in another project) as much as for the tasks it depends on.
// From the open work that finishes the project (within an hour), it walks back to
// whatever ends right before each task starts (less than an hour of working time
// between them, or running into it). Finished work stops the walk: it can't be
// delayed any more. `tasks` = [{ id, span: { start, end }, dependsOn: [id], assignee,
// project, status }], spans as held on the plan (heldSpan). Returns a Set of task ids,
// across all projects.
export function criticalPath(tasks, cal) {
  const open = tasks.filter((t) => HOLDING_STATUSES.includes(t.status));
  const byId = new Map(open.map((t) => [t.id, t]));
  const byPerson = {};
  for (const t of open) if (t.assignee) (byPerson[t.assignee] ||= []).push(t);
  // Working time from a's end to b's start (0 when a runs into b).
  const gap = (a, b) => workMsBetween(a.span.end, b.span.start, cal);
  // The employee's work just before `t`: the one that started earlier and ends last.
  const queuePrev = (t) =>
    (byPerson[t.assignee] || []).filter((o) => o.id !== t.id && o.span.start < t.span.start).reduce((best, o) => (!best || o.span.end > best.span.end ? o : best), null);
  const drivers = (t) => [...(t.dependsOn || []).map((id) => byId.get(id)), queuePrev(t)].filter((p) => p && gap(p, t) < HOUR);

  const out = new Set();
  const byProject = {};
  for (const t of open) if (t.project) (byProject[t.project] ||= []).push(t);
  for (const list of Object.values(byProject)) {
    const end = Math.max(...list.map((t) => t.span.end));
    const stack = list.filter((t) => workMsBetween(t.span.end, end, cal) < HOUR);
    for (let guard = 0; stack.length && guard < 5000; guard += 1) {
      const t = stack.pop();
      if (out.has(t.id)) continue;
      out.add(t.id);
      stack.push(...drivers(t));
    }
  }
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
