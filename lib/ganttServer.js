import { FINAL_STATUSES, freeGaps, gapFrom, isRedo, heldSpan, HOLDING_STATUSES, makeCalendar, officeDate, officeDaySpan, overlapping, placeTask, taskSpan, taskWorkMs, untangle, readyTime } from "@/lib/gantt";
import { DEFAULT_ROLE } from "@/lib/permissions";
import { pickName, viewerLang } from "@/lib/personName";
import { getSettings } from "@/lib/settings";
import { logActivity, publishTaskChange } from "@/lib/tasks";
import LeaveRequest from "@/models/LeaveRequest";
import Role from "@/models/Role";
import Task from "@/models/Task";
import User from "@/models/User";
import WorkProject from "@/models/WorkProject";

export async function getWorkCalendar() {
  return makeCalendar(await getSettings());
}

const idStr = (v) => (v ? v.toString() : null);
const MINUTE = 60000;

export const serializeMilestone = (m) => ({
  id: m._id.toString(),
  name: m.name,
  date: m.date,
  dependsOn: (m.dependsOn || []).map(idStr),
  doneAt: m.doneAt,
  baselineDate: m.baselineDate,
});

// ---------- each employee's own calendar ----------

function datesBetween(from, to) {
  const out = [];
  for (let d = new Date(`${from}T12:00:00Z`); d.toISOString().slice(0, 10) <= to && out.length < 400; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

async function loadPersonCalendar(userId, cal) {
  const today = officeDate(Date.now(), cal);
  const [user, leaves] = await Promise.all([
    User.findById(userId, { workSchedule: 1 }).lean(),
    LeaveRequest.find({ user: userId, status: "approved", to: { $gte: today } }, { from: 1, to: 1 }).lean(),
  ]);
  const leaveDays = [...new Set(leaves.flatMap((l) => datesBetween(l.from < today ? today : l.from, l.to)))];
  const s = user?.workSchedule?.custom ? user.workSchedule : null;
  if (!s && !leaveDays.length) return cal;
  const num = (v) => typeof v === "number" && Number.isFinite(v);
  return {
    ...cal,
    // A personal schedule, as in lib/hr personalWorkHours: its start / end / hours on every working day.
    days: s ? cal.days.map((d) => ({ start: s.workStart || d.start, end: s.workEnd || d.end, hours: num(s.dailyHours) ? s.dailyHours : d.hours })) : cal.days,
    ramadanHours: s && num(s.ramadanHours) ? s.ramadanHours : cal.ramadanHours,
    // Approved leave is a day off; a company special day doesn't override it.
    holidays: [...cal.holidays, ...leaveDays],
    special: cal.special.filter((d) => !leaveDays.includes(d.date)),
    leaveDays,
  };
}

const personal = new WeakMap();
// The company calendar with an employee's personal hours and approved leave on top.
// Work is planned on it. Remembered per company calendar (one per request).
export function personCalendar(userId, cal) {
  if (!userId) return Promise.resolve(cal);
  let byUser = personal.get(cal);
  if (!byUser) personal.set(cal, (byUser = new Map()));
  const key = idStr(userId);
  if (!byUser.has(key)) byUser.set(key, loadPersonCalendar(key, cal));
  return byUser.get(key);
}

// The employee's days of leave as spans no task may sit on.
const leaveSpans = (pc) => (pc.leaveDays || []).map((iso) => officeDaySpan(iso, pc));

// The day of the employee's approved leave ("YYYY-MM-DD") that a task planned
// [start, end) starts or ends on, or null. A task may run across a day of leave (its
// hours skip it); it just can't begin or finish while the employee is away.
export async function leaveClash(assigneeId, start, end, cal) {
  if (!assigneeId || !start || !end) return null;
  const pc = await personCalendar(assigneeId, cal);
  const edges = [new Date(start).getTime(), new Date(end).getTime() - 1];
  return (pc.leaveDays || []).find((iso) => {
    const day = officeDaySpan(iso, pc);
    return edges.some((ms) => ms >= day.start && ms < day.end);
  }) || null;
}

// ---------- taken time ----------

// The time an employee already has taken: their other dated, unfinished tasks and meetings.
async function takenTime(assigneeId, excludeIds = []) {
  return Task.find({
    assignee: assigneeId,
    status: { $in: HOLDING_STATUSES },
    plannedStart: { $ne: null },
    dueAt: { $ne: null },
    _id: { $nin: excludeIds },
  }).lean();
}

// Another task or meeting of the employee planned in [start, end), or null.
export async function findOverlap(assigneeId, start, end, excludeIds = []) {
  if (!assigneeId || !start || !end) return null;
  return overlapping({ start: new Date(start).getTime(), end: new Date(end).getTime() }, await takenTime(assigneeId, excludeIds));
}

// The first gap of `workMs` working time at/after `from` in the employee's schedule
// (plus `extra` spans not saved yet), on their own calendar (personal hours, leave).
// New work fills free time; it never pushes anyone.
export async function freeSlot(assigneeId, from, workMs, cal, excludeIds = [], extra = []) {
  const pc = await personCalendar(assigneeId, cal);
  const taken = (await takenTime(assigneeId, excludeIds)).map(heldSpan);
  return gapFrom(from, workMs, [...taken, ...extra], pc);
}

async function saveSpan(task, span, actor, data = {}) {
  task.plannedStart = new Date(span.start);
  task.dueAt = new Date(span.end);
  task.dueReminderSent = false;
  task.overdueNotified = false;
  await task.save();
  await logActivity(task._id, actor, "rescheduled", "", data);
  await publishTaskChange(task);
}

// Untangles an employee's schedule after something moved: not-started tasks that
// overlap other work, a meeting or a day of leave go into the first free gap after it,
// keeping their working length. Started tasks and meetings stay put. A pushed task may
// take the place of a not-started task of lower priority (redos of rejected work rank
// above all), which then moves later instead; equal priorities keep their order.
// Returns the ids of the tasks that moved.
export async function clearOverlaps(assigneeId, cal, actor) {
  const pc = await personCalendar(assigneeId, cal);
  const work = await Task.find({
    assignee: assigneeId,
    status: { $in: HOLDING_STATUSES },
    plannedStart: { $ne: null },
    dueAt: { $ne: null },
  });
  const movable = (t) => t.status === "todo" && t.kind !== "meeting";
  const next = untangle(
    [...work.filter((t) => !movable(t)).map(heldSpan), ...leaveSpans(pc)],
    work.filter(movable).map((task) => {
      const span = taskSpan(task);
      return { id: idStr(task._id), span, workMs: taskWorkMs(task, pc, span), priority: isRedo(task) ? "redo" : task.priority };
    }),
    pc
  );
  const moved = [];
  for (const task of work.filter((t) => next.has(idStr(t._id)))) {
    const span = next.get(idStr(task._id));
    const was = taskSpan(task);
    if (was.start === span.start && was.end === span.end) continue;
    await saveSpan(task, span, actor);
    moved.push(task._id);
  }
  return moved;
}

// After `rootIds` moved, pushes every not-started task that now starts before one
// of its predecessors finishes to right after them (not in the past), keeping its
// working length; then untangles that employee's schedule (see clearOverlaps) and
// does the same for the successors of everything that moved. Only pushes later;
// pullForward() moves work earlier. Returns the moved task documents.
export async function cascadeFrom(rootIds, cal, actor) {
  const moved = new Set();
  const queue = rootIds.map(idStr);
  for (let guard = 0; queue.length && guard < 1000; guard += 1) {
    const id = queue.shift();
    const successors = await Task.find({ dependsOn: id, status: "todo", kind: { $ne: "meeting" } });
    for (const task of successors) {
      const preds = await Task.find({ _id: { $in: task.dependsOn }, status: { $ne: "cancelled" } }).lean();
      if (!preds.length) continue;
      // Finished, plus any external review the work goes out for.
      const ready = Math.max(...preds.map((p) => readyTime(p, cal)));
      const span = taskSpan(task);
      if (span.start >= ready) continue;
      const pc = await personCalendar(task.assignee, cal);
      await saveSpan(task, placeTask(Math.max(ready, Date.now()), taskWorkMs(task, pc, span), pc), actor, { by: id });
      const shifted = (await clearOverlaps(task.assignee, cal, actor)).map(idStr);
      for (const x of [idStr(task._id), ...shifted]) {
        moved.add(x);
        queue.push(x);
      }
    }
  }
  if (!moved.size) return [];
  return Task.find({ _id: { $in: [...moved] }, status: { $nin: FINAL_STATUSES } });
}

// Free time on each employee's plan in the next `days` days: working time (on their own
// calendar, leave excluded) that no task or meeting of theirs, in any project, holds.
// Managers whose role sees the whole company (GM, CEO) plan the work, so they're left
// out. Only gaps of at least `minHours` count. Returns [{ id, name, avatarUrl, freeMs,
// gaps: [{ start, end, ms }] }] of the people with free time, the most free first.
export async function freeTime(cal, { days = 14, minHours = 2 } = {}) {
  const now = Date.now();
  const to = now + days * 24 * 60 * MINUTE;
  const managerRoles = (await Role.find({ scope: "all" }, { key: 1 }).lean()).map((r) => r.key);
  const [people, work] = await Promise.all([
    User.find({ role: { $nin: [DEFAULT_ROLE, ...managerRoles] }, status: { $ne: "inactive" } }, { name: 1, nameAr: 1, email: 1, avatarUrl: 1 }).lean(),
    Task.find({ assignee: { $ne: null }, status: { $in: HOLDING_STATUSES }, plannedStart: { $ne: null }, dueAt: { $ne: null } }).lean(),
  ]);
  const lang = await viewerLang();
  const out = [];
  for (const p of people) {
    const id = idStr(p._id);
    const pc = await personCalendar(id, cal);
    const taken = work.filter((t) => idStr(t.assignee) === id).map(heldSpan);
    const gaps = freeGaps(taken, now, to, pc, minHours * 60 * MINUTE);
    if (!gaps.length) continue;
    out.push({ id, name: pickName(p, lang), avatarUrl: p.avatarUrl || "", freeMs: gaps.reduce((n, g) => n + g.ms, 0), gaps });
  }
  return out.sort((a, b) => b.freeMs - a.freeMs);
}

// "Fill free time": moves not-started work earlier wherever the plan allows — into
// free time its employee has (work finished early, a task moved or cancelled), once
// the tasks it waits for are planned to finish, not before its project's start and
// not in the past. Tasks go in plan order and never move later; started work,
// meetings and leave stay put. Returns the moved task documents.
export async function pullForward(cal, actor) {
  const now = Date.now();
  const work = await Task.find({ status: { $in: HOLDING_STATUSES }, plannedStart: { $ne: null }, dueAt: { $ne: null } });
  const waiting = work.filter((t) => t.status === "todo" && t.kind !== "meeting").sort((a, b) => taskSpan(a).start - taskSpan(b).start);
  if (!waiting.length) return [];

  const predIds = [...new Set(waiting.flatMap((t) => t.dependsOn.map(idStr)))];
  const preds = Object.fromEntries((await Task.find({ _id: { $in: predIds }, status: { $ne: "cancelled" } }).lean()).map((p) => [idStr(p._id), p]));
  const projectIds = [...new Set(waiting.map((t) => idStr(t.project)).filter(Boolean))];
  const starts = Object.fromEntries(
    (await WorkProject.find({ _id: { $in: projectIds } }, { startDate: 1 }).lean()).map((p) => [idStr(p._id), p.startDate ? new Date(p.startDate).getTime() : 0])
  );

  // Time each employee can't use: work already going, meetings, leave, and the waiting
  // tasks placed so far in this pass.
  const taken = {};
  const takenOf = async (who, pc) => {
    if (!taken[who]) taken[who] = [...work.filter((t) => idStr(t.assignee) === who && (t.status !== "todo" || t.kind === "meeting")).map(heldSpan), ...leaveSpans(pc)];
    return taken[who];
  };
  const ends = new Map(); // task id → planned finish after this pass
  const moved = [];
  for (const task of waiting) {
    const who = idStr(task.assignee);
    const pc = await personCalendar(who, cal);
    const spans = await takenOf(who, pc);
    const span = taskSpan(task);
    const ready = Math.max(
      now,
      starts[idStr(task.project)] || 0,
      // A predecessor moved in this pass: its new finish, plus its external review.
      ...task.dependsOn
        .map(idStr)
        .filter((id) => preds[id])
        .map((id) => (ends.has(id) ? readyTime({ ...preds[id], status: "todo", plannedStart: new Date(ends.get(id) - 1), dueAt: new Date(ends.get(id)) }, cal) : readyTime(preds[id], cal)))
    );
    const slot = gapFrom(ready, taskWorkMs(task, pc, span), spans, pc);
    const next = slot.start < span.start - MINUTE ? slot : span;
    ends.set(idStr(task._id), next.end);
    spans.push(next);
    if (next === span) continue;
    await saveSpan(task, next, actor, { pulled: true });
    moved.push(task);
  }
  return moved;
}
