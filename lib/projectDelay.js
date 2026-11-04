// Expected delivery of each project (when its last task is planned to finish), its
// baselines, and the log of why it moved. Every screen or job that changes task
// dates calls trackDelays() with the cause, so each move is explained.
import { addWorkHours, heldSpan, readyTime, HOUR, placeTask, taskSpan, taskWorkMs, workMsBetween } from "@/lib/gantt";
import { cascadeFrom, clearOverlaps, getWorkCalendar, personCalendar } from "@/lib/ganttServer";
import { projectChannel } from "@/lib/projects";
import { publish } from "@/lib/realtime/server";
import { logActivity, publishTaskChange } from "@/lib/tasks";
import Task from "@/models/Task";
import WorkProject from "@/models/WorkProject";

const idStr = (v) => (v ? v.toString() : null);
const PLAN_KINDS = ["task", "revision"];
const MINUTE = 60000;

const live = (tasks) => tasks.filter((t) => PLAN_KINDS.includes(t.kind) && !["cancelled", "rejected"].includes(t.status) && t.dueAt);

// Planned finish of a project's work: the latest finish of its live tasks, or null.
// Work out for an external review isn't delivered until the review is back (`cal`).
export function projectEnd(tasks, cal = null) {
  const list = live(tasks);
  return list.length ? Math.max(...list.map((t) => readyTime(t, cal))) : null;
}

// Start of a project's work: when its first task starts — as planned, or once work
// began, when it actually did (like a Gantt summary's start). Null without tasks.
export function projectStart(tasks) {
  const list = live(tasks);
  return list.length ? Math.min(...list.map((t) => taskSpan(t).start)) : null;
}

// { projectId: { start, end } } of the projects' live tasks.
async function plannedByProject(projectIds) {
  const tasks = await Task.find(
    { project: { $in: projectIds }, kind: { $in: PLAN_KINDS }, status: { $nin: ["cancelled", "rejected"] }, dueAt: { $ne: null } },
    { project: 1, kind: 1, status: 1, plannedStart: 1, dueAt: 1, expectedEnd: 1, submittedAt: 1, startedAt: 1, createdAt: 1, estimatedHours: 1, externalReview: 1 }
  ).lean();
  const by = {};
  for (const t of tasks) (by[idStr(t.project)] ||= []).push(t);
  const cal = await getWorkCalendar();
  return Object.fromEntries(Object.entries(by).map(([id, list]) => [id, { start: projectStart(list), end: projectEnd(list, cal) }]));
}

// Saves Baseline 1 — the expected start and delivery — (and the task dates it was made
// of) for a just-planned project.
export async function saveFirstBaseline(project, actor) {
  const plan = (await plannedByProject([project._id]))[idStr(project._id)];
  if (!plan?.end) return;
  project.forecastStart = new Date(plan.start);
  project.forecastEnd = new Date(plan.end);
  project.baselines = [{ n: 1, start: new Date(plan.start), end: new Date(plan.end), at: new Date(), by: actor?.id || null }];
  project.taskBaselineAt = new Date();
  await project.save();
  const tasks = await Task.find({ project: project._id, status: { $ne: "cancelled" } }, { plannedStart: 1, dueAt: 1 }).lean();
  if (tasks.length) {
    await Task.bulkWrite(tasks.map((t) => ({ updateOne: { filter: { _id: t._id }, update: { baselineStart: t.plannedStart, baselineEnd: t.dueAt } } })));
  }
}

// Re-reads the expected start and delivery of every active project and logs each
// change with its cause: { cause, task (document or lean), note }. A change in a project
// that isn't the task's own (the same employee's queue moved) names the other project.
// The same cause on the same task right after the last entry of that kind (start or
// delivery) extends that entry.
export async function trackDelays({ cause, task = null, note = "" }, actor = null) {
  const projects = await WorkProject.find({ status: "active", forecastEnd: { $ne: null } });
  if (!projects.length) return;
  const plans = await plannedByProject(projects.map((p) => p._id));
  const cal = await getWorkCalendar();
  for (const project of projects) {
    const plan = plans[idStr(project._id)];
    if (!plan) continue;
    let changed = false;
    for (const field of ["start", "end"]) {
      const key = field === "start" ? "forecastStart" : "forecastEnd";
      const now = plan[field];
      const before = project[key]?.getTime();
      if (!now || (before && Math.abs(now - before) < MINUTE)) continue;
      changed = true;
      project[key] = new Date(now);
      // Older projects had no expected start yet: it's just recorded.
      if (!before) continue;
      const own = project.delays.filter((d) => (d.field || "end") === field);
      const last = own[own.length - 1];
      const sameCause = last && task && last.cause === cause && idStr(last.task) === idStr(task._id);
      const from = sameCause ? last.from.getTime() : before;
      if (sameCause) project.delays.splice(project.delays.indexOf(last), 1);
      if (Math.abs(now - from) < MINUTE) continue;
      project.delays.push({
        at: new Date(),
        from: new Date(from),
        to: new Date(now),
        workMs: now >= from ? workMsBetween(from, now, cal) : -workMsBetween(now, from, cal),
        field,
        cause,
        task: task?._id || null,
        taskNumber: task?.number ?? null,
        taskProject: task?.project && idStr(task.project) !== idStr(project._id) ? task.project : null,
        note: String(note || "").slice(0, 500),
        by: actor?.id || actor?._id || null,
      });
    }
    if (!changed) continue;
    await project.save();
    await publish(projectChannel(idStr(project._id)), "project:updated", { id: idStr(project._id) });
  }
}

// The plan after a running task's expected finish changed: the employee's next tasks
// and the tasks waiting for it move later.
async function replanAfter(task, cal, actor, cause) {
  await task.save();
  await publishTaskChange(task);
  const moved = await clearOverlaps(task.assignee, cal, actor);
  await cascadeFrom([task._id, ...moved], cal, actor);
  // Paused work goes on after this one, so it moves too.
  await replanPaused(task.assignee, cal, actor, false);
  await trackDelays({ cause, task }, actor);
}

// Work paused (on hold) while the employee does something else can only go on after
// that: its remaining hours (planned hours minus time worked; overrunHours() once those
// are used up) are planned right after the task they're working on now, one paused
// task after another, and its expected finish moves there — so it never sits on the
// same time as the current work. Tasks waiting for it move with it. `track` logs the
// change in the projects' delivery.
export async function replanPaused(assigneeId, cal, actor = null, track = true) {
  const paused = await Task.find({ assignee: assigneeId, status: "on_hold", kind: { $ne: "meeting" } }).sort({ startedAt: 1 });
  if (!paused.length) return;
  const running = await Task.find({ assignee: assigneeId, status: { $in: ["in_progress", "help"] }, kind: { $ne: "meeting" } }).lean();
  const pc = await personCalendar(assigneeId, cal);
  let cursor = Math.max(Date.now(), ...running.map((t) => heldSpan(t).end));
  const changed = [];
  for (const task of paused) {
    const planned = (task.maxHours || task.estimatedHours || 1) * HOUR;
    const left = task.activeMs >= planned ? overrunHours(task) * HOUR : Math.max(HOUR / 2, planned - task.activeMs);
    const end = addWorkHours(cursor, left / HOUR, pc);
    cursor = end;
    // Only a finish past its due time is kept; otherwise the due time stands.
    const next = end > taskSpan(task).end ? end : null;
    const was = task.expectedEnd ? task.expectedEnd.getTime() : null;
    if (next === was || (next && was && Math.abs(next - was) < MINUTE)) continue;
    task.expectedEnd = next ? new Date(next) : null;
    await task.save();
    await publishTaskChange(task);
    changed.push(task);
  }
  if (!changed.length) return;
  const moved = await clearOverlaps(assigneeId, cal, actor);
  await cascadeFrom([...changed.map((t) => t._id), ...moved], cal, actor);
  if (track) await trackDelays({ cause: "paused", task: changed[0] }, actor);
}

// Hours a late task is expected to still need when nobody said: a quarter of its
// planned hours, at least one.
export const overrunHours = (task) => Math.max(1, Math.round((task.maxHours || task.estimatedHours || 1) * 0.25 * 2) / 2);

// Work running past its due time (or past the finish the employee gave): it's now
// expected to need overrunHours() more, so the plan jumps once to a realistic finish
// instead of creeping an hour at a time. Logged as "took longer than planned". Then
// moves not-started work whose start has passed (moveLateStarts). Returns how many
// running tasks were late.
export async function markOverruns(now = Date.now()) {
  const late = await Task.find({
    status: { $in: ["in_progress", "help"] },
    kind: { $ne: "meeting" },
    dueAt: { $lt: new Date(now) },
    $or: [{ expectedEnd: null }, { expectedEnd: { $lt: new Date(now) } }],
  });
  const cal = await getWorkCalendar();
  const next = Math.ceil((now + 1) / HOUR) * HOUR;
  for (const task of late) {
    const pc = await personCalendar(task.assignee, cal);
    task.expectedEnd = new Date(Math.max(next, addWorkHours(now, overrunHours(task), pc)));
    await replanAfter(task, cal, null, "overrun");
  }
  // Paused work whose expected finish has passed is planned again after the current work.
  const paused = await Task.distinct("assignee", {
    status: "on_hold",
    kind: { $ne: "meeting" },
    $or: [{ expectedEnd: { $lt: new Date(now) } }, { expectedEnd: null, dueAt: { $lt: new Date(now) } }],
  });
  for (const who of paused) await replanPaused(who, cal);
  await moveLateStarts(now, cal);
  return late.length;
}

// The employee says how many working hours a late task still needs: the plan uses it
// until that time passes too.
export async function setHoursLeft(task, hours, actor) {
  const cal = await getWorkCalendar();
  task.expectedEnd = new Date(addWorkHours(Date.now(), hours, await personCalendar(task.assignee, cal)));
  await replanAfter(task, cal, actor, "overrun");
}

// Not-started work whose planned start has passed can only start now: it moves to the
// next full hour (or after the tasks it waits for), keeping its working length, and
// everything after it moves too — like a Gantt tool's status date. Logged as "not
// started on time". Its lateness still shows against its baseline.
export async function moveLateStarts(now = Date.now(), cal = null) {
  const active = await WorkProject.find({ status: "active" }, { _id: 1 }).lean();
  const late = await Task.find({
    status: "todo",
    kind: { $ne: "meeting" },
    plannedStart: { $lt: new Date(now) },
    dueAt: { $ne: null },
    $or: [{ project: null }, { project: { $in: active.map((p) => p._id) } }],
  });
  if (!late.length) return 0;
  cal ||= await getWorkCalendar();
  const next = Math.ceil((now + 1) / HOUR) * HOUR;
  for (const task of late) {
    const preds = task.dependsOn.length ? await Task.find({ _id: { $in: task.dependsOn }, status: { $ne: "cancelled" } }).lean() : [];
    const pc = await personCalendar(task.assignee, cal);
    const slot = placeTask(Math.max(next, ...preds.map((p) => readyTime(p, cal))), taskWorkMs(task, pc), pc);
    task.plannedStart = new Date(slot.start);
    task.dueAt = new Date(slot.end);
    task.dueReminderSent = false;
    task.overdueNotified = false;
    await task.save();
    await logActivity(task._id, null, "rescheduled", "", { notStarted: true });
    await publishTaskChange(task);
    const moved = await clearOverlaps(task.assignee, cal, null);
    await cascadeFrom([task._id, ...moved], cal, null);
    await trackDelays({ cause: "not_started", task });
  }
  return late.length;
}

// markOverruns() at most every few minutes per server, for screens that show the plan.
let lastOverrunCheck = 0;
export async function markOverrunsSoon() {
  if (Date.now() - lastOverrunCheck < 5 * MINUTE) return;
  lastOverrunCheck = Date.now();
  try {
    await markOverruns();
  } catch (err) {
    console.error("markOverruns", err);
  }
}
