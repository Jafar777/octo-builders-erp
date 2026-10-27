import { addWorkHours, finishTime, HOUR, nextWorkMoment, taskWorkMs, workMsBetween } from "@/lib/gantt";
import { cascadeFrom, clearOverlaps, freeSlot, personCalendar } from "@/lib/ganttServer";
import { stageAfter } from "@/lib/stageFlow";
import { publishTaskChange } from "@/lib/tasks";
import Task from "@/models/Task";
import WorkProject from "@/models/WorkProject";

const RUNNING = ["in_progress", "on_hold", "help"];

const time = (d) => (d ? new Date(d).getTime() : 0);

// Working hours of a planned span, to the half hour (at least half an hour).
export const spanHours = (start, end, cal) => Math.max(0.5, Math.round((workMsBetween(new Date(start).getTime(), new Date(end).getTime(), cal) / HOUR) * 2) / 2);

// A task's hours follow its planned time: the estimate, and the allowed hours of
// tasks that have them. Returns the fields to set.
export function hoursFields(task, start, end, cal) {
  if (!start || !end) return {};
  const hours = spanHours(start, end, cal);
  return task.maxHours > 0 ? { estimatedHours: hours, maxHours: hours } : { estimatedHours: hours };
}

// Where a not-started task goes when it's given to `assigneeId`: the first free gap in
// that employee's schedule after the tasks it waits for, not before the project's start
// and not in the past. It keeps its working length. Returns { start, end }.
export async function placeForAssignee(task, assigneeId, cal) {
  const length = taskWorkMs(task, await personCalendar(task.assignee, cal));
  const preds = task.dependsOn?.length ? await Task.find({ _id: { $in: task.dependsOn }, status: { $ne: "cancelled" } }).lean() : [];
  const project = task.project ? await WorkProject.findById(task.project, { startDate: 1 }).lean() : null;
  const earliest = Math.max(Date.now(), ...preds.map(finishTime), project?.startDate ? new Date(project.startDate).getTime() : 0);
  return freeSlot(assigneeId, earliest, length, cal, [task._id]);
}

// Plans every stage of a new project for the employee chosen for it: each task goes
// into that employee's first free time that fits its hours, once the stages it waits
// for are planned to finish (not before the project's start, not in the past).
// `plan` = { stageKey: { hours, assigneeId } }.
// Returns [{ stage, assigneeId, hours, start, end }] in stage order.
export async function planProjectStages(stages, plan, projectStart, cal) {
  const planned = {}; // this project's slots per employee, not saved yet
  const out = [];
  const ends = {};
  for (const [i, stage] of stages.entries()) {
    const p = plan[stage.key];
    if (!p) continue;
    const earliest = Math.max(Date.now(), projectStart, ...stageAfter(stages, i).map((k) => ends[k] || 0));
    const slot = await freeSlot(p.assigneeId, earliest, Math.max(p.hours, 0.5) * HOUR, cal, [], planned[p.assigneeId] || []);
    (planned[p.assigneeId] ||= []).push(slot);
    ends[stage.key] = slot.end;
    out.push({ stage, assigneeId: p.assigneeId, hours: p.hours, ...slot });
  }
  return out;
}

// Gives the not-started tasks of each stage every current task of each stage it waits
// for as predecessors — all the people working on it, a rejected task counting through
// its redo (keeping their predecessors outside the project's stages), then pushes
// tasks that now start too early. A stage set to Skip / Done by hand no longer holds
// anyone up, so its tasks aren't predecessors. Run after a project's stage order or a
// manual state changes, and after a stage task is added. Returns the tasks whose
// predecessors changed.
export async function syncStageDependencies(project, cal, actor) {
  const tasks = await Task.find({ project: project._id, stage: { $ne: "" }, kind: { $in: ["task", "revision"] }, status: { $ne: "cancelled" } }).sort({ createdAt: 1 });
  // A stage's current tasks: all but the rejected ones (each was replaced by its redo).
  const current = {};
  for (const t of tasks) if (t.status !== "rejected") (current[t.stage] ||= []).push(t._id);
  const stageTaskIds = new Set(tasks.map((t) => t._id.toString()));
  // Newest manual state of each stage.
  const manual = {};
  for (const o of [...(project.overrides || [])].sort((a, b) => new Date(a.at) - new Date(b.at))) manual[o.stage] = o.status;
  const released = (key) => ["skip", "done"].includes(manual[key]);
  const changed = [];
  const updated = [];
  for (const [i, stage] of project.stages.entries()) {
    const wanted = stageAfter(project.stages, i).filter((k) => !released(k)).flatMap((k) => current[k] || []);
    for (const task of tasks.filter((t) => t.stage === stage.key && t.status === "todo")) {
      const own = (task.dependsOn || []).filter((id) => !stageTaskIds.has(id.toString()));
      const next = [...own, ...wanted];
      const same = next.length === task.dependsOn.length && next.every((id) => task.dependsOn.some((d) => d.equals(id)));
      if (same) continue;
      task.dependsOn = next;
      await task.save();
      await publishTaskChange(task);
      changed.push(...wanted);
      updated.push(task);
    }
  }
  if (changed.length) await cascadeFrom([...new Set(changed.map(String))], cal, actor);
  return updated;
}

// A rejected task's redo (R-01, R-02…) goes into the employee's schedule right away:
// after the task they're working on now, before everything they haven't started.
// It outranks all their waiting work, so only the tasks it actually lands on move later
// (see clearOverlaps) — work with free time before it stays — and tasks waiting for
// those move with them. `end` = a custom due date (GM / CEO). Returns { start, end }.
export async function insertRedo(revision, hours, companyCal, actor, end = null) {
  const assignee = revision.assignee;
  const cal = await personCalendar(assignee, companyCal);
  const running = await Task.find({ assignee, status: { $in: RUNNING }, kind: { $ne: "meeting" }, _id: { $ne: revision._id } }, { dueAt: 1, expectedEnd: 1 }).lean();
  const start = nextWorkMoment(Math.max(Date.now(), ...running.map((t) => Math.max(time(t.dueAt), time(t.expectedEnd)))), cal);
  const finish = end && end.getTime() > start ? end.getTime() : addWorkHours(start, hours, cal);

  revision.plannedStart = new Date(start);
  revision.dueAt = new Date(finish);
  await revision.save();

  // Waiting work it lands on moves after it; meetings and leave stay put (the redo moves past them).
  const moved = await clearOverlaps(assignee, companyCal, actor);
  if (moved.length) await cascadeFrom(moved, companyCal, actor);
  return { start, end: finish };
}
