import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { addWorkHours, canMoveTask, holdsTime, HOUR, nextWorkMoment, readyTime, taskSpan } from "@/lib/gantt";
import { cascadeFrom, findOverlap, getWorkCalendar, leaveClash, personCalendar } from "@/lib/ganttServer";
import { notify } from "@/lib/notify";
import { trackDelays } from "@/lib/projectDelay";
import { canRouteStages } from "@/lib/projects";
import { hoursFields, placeForAssignee } from "@/lib/taskSchedule";
import { cleanDependsOn, enrichTask, enrichTasks, FINAL_STATUSES, logActivity, publishTaskChange, taskTitle } from "@/lib/tasks";
import Task from "@/models/Task";
import User from "@/models/User";

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// Gantt edits by the GM / CEO. Body (all optional):
// { plannedStart, dueAt, estimatedHours, assigneeId, priority, dependsOn: [taskId], cascade: true }
// The task's hours always follow its planned time: new dates set the hours, new hours
// (without dates) set the due time. A new employee without new dates puts the task in
// their first free gap. With `cascade`, tasks waiting for this one are pushed later.
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
  // Started, rejected or accepted tasks keep their place and employee; only priority can change.
  const reassign = isObjectId(body.assigneeId) && body.assigneeId !== task.assignee.toString();
  const timing = reassign || ["plannedStart", "dueAt", "estimatedHours", "dependsOn"].some((k) => body[k] !== undefined);
  if (timing && !canMoveTask(task)) return fail("task_locked");
  const cal = await getWorkCalendar();

  if (reassign) {
    if (!(await User.exists({ _id: body.assigneeId, status: "active", role: { $ne: "user" } }))) return fail("invalid_assignee");
    changes.assignee = body.assigneeId;
  }
  // Hours count on the employee's own calendar (personal hours, leave).
  const pc = await personCalendar(changes.assignee || task.assignee, cal);
  if (body.plannedStart !== undefined) {
    const d = parseDate(body.plannedStart);
    if (d === undefined) return fail("invalid_date");
    changes.plannedStart = d;
  }
  if (body.dueAt !== undefined) {
    const d = parseDate(body.dueAt);
    if (d === undefined) return fail("invalid_date");
    changes.dueAt = d;
  }
  const datesGiven = "plannedStart" in changes || "dueAt" in changes;
  if (!datesGiven && body.estimatedHours !== undefined) {
    // New hours: the due time moves so the task lasts that many working hours.
    const hours = Math.max(0.5, Math.min(1000, Number(body.estimatedHours) || 0));
    const start = nextWorkMoment(taskSpan(task).start, pc);
    changes.plannedStart = new Date(start);
    changes.dueAt = new Date(addWorkHours(start, hours, pc));
  } else if (!datesGiven && reassign) {
    // New employee: the first free gap in their schedule, keeping the task's length.
    const slot = await placeForAssignee(task, changes.assignee, cal);
    changes.plannedStart = new Date(slot.start);
    changes.dueAt = new Date(slot.end);
  }

  const start = "plannedStart" in changes ? changes.plannedStart : task.plannedStart;
  const due = "dueAt" in changes ? changes.dueAt : task.dueAt;
  if ("plannedStart" in changes || "dueAt" in changes) {
    // Dates can't move into the past (staying where they already are is fine).
    const pastLimit = Date.now() - 5 * 60 * 1000;
    const intoPast = (key) => key in changes && changes[key] && changes[key].getTime() < Math.min(pastLimit, task[key] ? task[key].getTime() : Infinity);
    if (intoPast("plannedStart") || intoPast("dueAt")) return fail("date_in_past");
    if (start && due && start > due) return fail("invalid_range");
    if (due && start && due - start < HOUR / 2) return fail("invalid_range");
    // An employee works on one task at a time: the new time can't overlap their other work.
    const assignee = changes.assignee || task.assignee;
    if (holdsTime({ ...task.toObject(), plannedStart: start, dueAt: due })) {
      const clash = await findOverlap(assignee, start, due, [task._id]);
      if (clash) return fail("schedule_overlap", 409, { number: clash.number });
    }
    // Not on the employee's approved leave.
    const leave = await leaveClash(assignee, start, due, cal);
    if (leave) return fail("on_leave", 409, { date: leave });
    Object.assign(changes, hoursFields(task, start, due, pc), { dueReminderSent: false, overdueNotified: false });
    // The GM set the time by hand: starting the task won't recalculate it from the hours.
    if (task.maxHours > 0) changes.dueManual = true;
  }

  if (["normal", "important", "urgent"].includes(body.priority)) changes.priority = body.priority;
  if (body.dependsOn !== undefined) {
    const deps = await cleanDependsOn(body.dependsOn, task._id);
    if (deps.error) return fail(deps.error);
    changes.dependsOn = deps.ids;
  }
  // A task can't be planned to start before the tasks it waits for finish. New dates
  // there are refused; a new predecessor is fine when the plan moves the task after it.
  if (start && (datesGiven || (changes.dependsOn && !body.cascade))) {
    const ids = changes.dependsOn || task.dependsOn;
    const preds = ids.length ? await Task.find({ _id: { $in: ids }, status: { $ne: "cancelled" } }).lean() : [];
    // Finished, plus any external review it went out for.
    const early = preds.filter((p) => readyTime(p, cal) > start.getTime() + 60000);
    if (early.length) return fail("before_dependency", 409, { numbers: early.map((p) => p.number) });
  }

  const before = task.assignee.toString();
  if (Object.keys(changes).length) {
    task.set(changes);
    await task.save();
    await logActivity(task._id, user, reassign ? "reassigned" : "edited", "", {
      fields: Object.keys(changes).filter((k) => !k.endsWith("Sent") && !["overdueNotified", "dueManual"].includes(k)),
    });
    await publishTaskChange(task, reassign ? [before] : []);
  }
  if (reassign) {
    const enriched = await enrichTask(task);
    const params = { actor: user.name || user.email, number: task.number, title: taskTitle(enriched) };
    await notify({ type: "task.reassigned", recipients: [before], actor: user, params, entityType: "task", entityId: task._id });
    await notify({ type: "task.assigned", recipients: [body.assigneeId], actor: user, params, link: `/dashboard/tasks?task=${task._id}`, entityType: "task", entityId: task._id });
  }

  // A new predecessor can push this task itself; new dates push its successors.
  let moved = [];
  if (body.cascade) {
    const roots = [];
    if (changes.dependsOn) roots.push(...changes.dependsOn);
    roots.push(task._id);
    moved = await cascadeFrom(roots, cal, user);
  }

  if (Object.keys(changes).length || moved.length) await trackDelays({ cause: reassign ? "reassigned" : "rescheduled", task }, user);

  const self = moved.find((m) => m._id.equals(task._id));
  return NextResponse.json({
    task: await enrichTask(self || task),
    moved: await enrichTasks(moved.filter((m) => !m._id.equals(task._id)).map((m) => m.toObject())),
  });
}
