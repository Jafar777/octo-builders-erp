import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { cascadeFrom, getWorkCalendar } from "@/lib/ganttServer";
import { canRouteStages } from "@/lib/projects";
import { cleanDependsOn, enrichTask, enrichTasks, FINAL_STATUSES, logActivity, publishTaskChange } from "@/lib/tasks";
import Task from "@/models/Task";

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// Gantt edits by the GM / CEO. Body (all optional):
// { plannedStart, dueAt, estimatedHours, priority, dependsOn: [taskId], cascade: true }
// With `cascade`, tasks waiting for this one are pushed later on the working calendar.
// Returns { task, moved: [tasks that were pushed] }.
export async function PATCH(request, { params }) {
  const user = await requireStaff();
  if (!user || !canRouteStages(user)) return forbidden();
  const { id } = await params;
  const task = isObjectId(id) ? await Task.findById(id) : null;
  if (!task) return notFound();
  if (FINAL_STATUSES.includes(task.status)) return fail("task_closed");

  const body = await readJson(request);
  const changes = {};

  if (body.plannedStart !== undefined) {
    const d = parseDate(body.plannedStart);
    if (d === undefined) return fail("invalid_date");
    changes.plannedStart = d;
  }
  if (body.dueAt !== undefined) {
    const d = parseDate(body.dueAt);
    if (d === undefined) return fail("invalid_date");
    changes.dueAt = d;
    changes.dueReminderSent = false;
    changes.overdueNotified = false;
    // The GM set it by hand: starting the task won't recalculate it from the scale.
    if (task.maxHours > 0) changes.dueManual = true;
  }
  const start = "plannedStart" in changes ? changes.plannedStart : task.plannedStart;
  const due = "dueAt" in changes ? changes.dueAt : task.dueAt;
  if (start && due && start > due) return fail("invalid_range");

  if (body.estimatedHours !== undefined) {
    changes.estimatedHours = Math.max(0, Math.min(1000, Number(body.estimatedHours) || 0));
  }
  if (["normal", "important", "urgent"].includes(body.priority)) changes.priority = body.priority;
  if (body.dependsOn !== undefined) {
    const deps = await cleanDependsOn(body.dependsOn, task._id);
    if (deps.error) return fail(deps.error);
    changes.dependsOn = deps.ids;
  }

  if (Object.keys(changes).length) {
    task.set(changes);
    await task.save();
    await logActivity(task._id, user, "edited", "", { fields: Object.keys(changes).filter((k) => !k.endsWith("Sent") && !["overdueNotified", "dueManual"].includes(k)) });
    await publishTaskChange(task);
  }

  // A new predecessor can push this task itself; new dates push its successors.
  let moved = [];
  if (body.cascade) {
    const cal = await getWorkCalendar();
    const roots = [];
    if (changes.dependsOn) roots.push(...changes.dependsOn);
    roots.push(task._id);
    moved = await cascadeFrom(roots, cal, user);
  }

  const self = moved.find((m) => m._id.equals(task._id));
  return NextResponse.json({
    task: await enrichTask(self || task),
    moved: await enrichTasks(moved.filter((m) => !m._id.equals(task._id)).map((m) => m.toObject())),
  });
}
