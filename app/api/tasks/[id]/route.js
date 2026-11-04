import { NextResponse } from "next/server";
import { reviewAccess } from "@/lib/taskReview";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { notify } from "@/lib/notify";
import {
  canManageTask,
  canViewTask,
  cleanDependsOn,
  cleanRecurrence,
  enrichTask,
  FINAL_STATUSES,
  hideReview,
  isInvolvedInTask,
  logActivity,
  publishTaskChange,
  taskTitle,
  managesAssignee,
  managesEmployee,
} from "@/lib/tasks";
import { holdsTime } from "@/lib/gantt";
import { cascadeFrom, findOverlap, getWorkCalendar, leaveClash, personCalendar } from "@/lib/ganttServer";
import { trackDelays } from "@/lib/projectDelay";
import { hoursFields, placeForAssignee } from "@/lib/taskSchedule";
import Task from "@/models/Task";
import TaskActivity from "@/models/TaskActivity";
import User from "@/models/User";
import { NAME_FIELDS, pickName, viewerLang } from "@/lib/personName";
import { canRouteStages } from "@/lib/projects";
import { userDepartments } from "@/lib/scope";

const HISTORY_FIELDS = { number: 1, revision: 1, status: 1, assignee: 1, ratings: 1, submittedAt: 1, previousTask: 1, kind: 1 };

// The rejected originals before this task and the revisions opened after it.
async function revisionChain(task) {
  const chain = [task.toObject()];
  let back = task.previousTask;
  for (let i = 0; back && i < 30; i += 1) {
    const prev = await Task.findOne({ _id: back, kind: { $in: ["task", "revision"] } }, HISTORY_FIELDS).lean();
    if (!prev) break;
    chain.push(prev);
    back = prev.previousTask;
  }
  let next = task._id;
  for (let i = 0; next && i < 30; i += 1) {
    const after = await Task.findOne({ previousTask: next, kind: "revision" }, HISTORY_FIELDS).lean();
    if (!after) break;
    chain.push(after);
    next = after._id;
  }
  return chain.sort((a, b) => b.revision - a.revision);
}

async function load(params) {
  const { id } = await params;
  return isObjectId(id) ? Task.findById(id) : null;
}

export async function GET(request, { params }) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const task = await load(params);
  if (!task) return notFound();
  if (!canViewTask(user, task)) return forbidden();

  const [activity, history] = await Promise.all([
    TaskActivity.find({ task: task._id }).sort({ createdAt: 1 }).lean(),
    // All revisions in this task's chain (R-00 → R-01 → …), newest first.
    task.project && task.stage ? revisionChain(task) : [],
  ]);
  const actorIds = [...new Set(activity.map((a) => a.actor?.toString()).filter(Boolean))];
  const actors = await User.find({ _id: { $in: actorIds } }, NAME_FIELDS).lean();
  const lang = await viewerLang();
  const names = Object.fromEntries(actors.map((a) => [a._id.toString(), pickName(a, lang)]));

  const involved = isInvolvedInTask(user, task);
  const access = await reviewAccess(user, task);
  const enriched = await enrichTask(task);

  return NextResponse.json({
    task: involved ? enriched : hideReview(enriched),
    permissions: {
      isAssignee: task.assignee.toString() === user.id,
      canPlan: canRouteStages(user),
      // The level this viewer may review now (null = none); see lib/taskReview.
      review: access,
      canReview: Boolean(access),
      canManage: canManageTask(user, task),
      // A department manager: start their employee's task for them, and give a
      // not-started task to another employee of their departments.
      canStartFor: task.assignee.toString() !== user.id && (await managesAssignee(user, task)),
      canReassign: task.status === "todo" && (canRouteStages(user) || (await managesAssignee(user, task))),
      departments: canRouteStages(user) ? null : userDepartments(user),
    },
    activity: activity.map((a) => {
      const review = !involved && ["approved", "rejected"].includes(a.type);
      return {
        id: a._id.toString(),
        type: a.type,
        text: review ? "" : a.text,
        data: review ? {} : a.data,
        actorName: names[a.actor?.toString()] || "—",
        createdAt: a.createdAt,
      };
    }),
    history: history.map((h) => ({
      id: h._id.toString(),
      number: h.number,
      revision: h.revision,
      status: h.status,
      ratings: involved ? h.ratings : [],
      submittedAt: h.submittedAt,
    })),
  });
}

// Edit details. Assignee: delivery link, notes, estimate. Managers: also due date,
// priority, description, reassignment.
export async function PATCH(request, { params }) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const task = await load(params);
  if (!task) return notFound();

  const isAssignee = task.assignee.toString() === user.id;
  // A department manager may also give their employee's not-started task to another
  // employee of their departments.
  const managesIt = await managesAssignee(user, task);
  const canManage = canManageTask(user, task) || managesIt;
  if (!isAssignee && !canManage) return forbidden();
  const body = await readJson(request);
  // A finished task can still have its repeat rule stopped.
  const onlyRecurrence = Object.keys(body).length === 1 && "recurrence" in body;
  if (FINAL_STATUSES.includes(task.status) && !onlyRecurrence) return fail("task_closed");

  const changes = {};
  if (typeof body.deliveryLink === "string") changes.deliveryLink = body.deliveryLink.trim().slice(0, 1000);
  if (typeof body.employeeNotes === "string") changes.employeeNotes = body.employeeNotes.slice(0, 2000);
  // Project work: its hours (and so its due time) are set by the GM / CEO only.
  const scaleLocked = (task.maxHours > 0 || Boolean(task.project)) && !canRouteStages(user);
  if (body.estimatedHours !== undefined && !scaleLocked) changes.estimatedHours = Math.max(0, Math.min(1000, Number(body.estimatedHours) || 0));

  // Planning fields (predecessors, repeat rule): GM / CEO only.
  if (canRouteStages(user)) {
    if (body.dependsOn !== undefined) {
      const deps = await cleanDependsOn(body.dependsOn, task._id);
      if (deps.error) return fail(deps.error);
      changes.dependsOn = deps.ids;
    }
    if (body.recurrence !== undefined) {
      if (task.project && task.stage) return fail("invalid_recurrence");
      const rec = cleanRecurrence(body.recurrence, body.dueAt ? new Date(body.dueAt) : task.dueAt);
      if (rec.error) return fail(rec.error);
      changes.recurrence = rec.value;
    }
  }

  let reassignedFrom = null;
  if (canManage) {
    if (body.dueAt !== undefined && !scaleLocked) {
      const d = body.dueAt ? new Date(body.dueAt) : null;
      if (d && Number.isNaN(d.getTime())) return fail("invalid_date");
      // Not into the past (keeping a due time that has already passed is fine).
      if (d && d.getTime() < Math.min(Date.now() - 5 * 60 * 1000, task.dueAt ? task.dueAt.getTime() : Infinity)) return fail("date_in_past");
      changes.dueAt = d;
      changes.dueReminderSent = false;
      changes.overdueNotified = false;
      if (task.maxHours > 0) changes.dueManual = true;
    }
    if (["normal", "important", "urgent"].includes(body.priority)) changes.priority = body.priority;
    if (typeof body.description === "string") changes.description = body.description.slice(0, 4000);
    if (isObjectId(body.assigneeId) && body.assigneeId !== task.assignee.toString()) {
      const next = await User.findOne({ _id: body.assigneeId, status: "active", role: { $ne: "user" } }, { department: 1 }).lean();
      if (!next) return fail("invalid_assignee");
      if (task.status !== "todo") return fail("reassign_only_todo");
      // Below the CEO: only their own employees' tasks, only to their own employees.
      if (!canRouteStages(user) && (!managesIt || !managesEmployee(user, next))) return fail("reassign_own_department", 403);
      reassignedFrom = task.assignee.toString();
      changes.assignee = body.assigneeId;
    }
  }

  // A planned task moves into the new employee's first free gap, keeping its length.
  const cal = await getWorkCalendar();
  if (reassignedFrom && holdsTime(task) && !("dueAt" in changes)) {
    const slot = await placeForAssignee(task, changes.assignee, cal);
    changes.plannedStart = new Date(slot.start);
    changes.dueAt = new Date(slot.end);
  }
  // Hours count on the employee's own calendar (personal hours, leave).
  const pc = await personCalendar(changes.assignee || task.assignee, cal);
  // A new due time of a planned task changes its hours too.
  if ("dueAt" in changes && changes.dueAt && task.plannedStart && !("estimatedHours" in changes)) {
    const start = changes.plannedStart || task.plannedStart;
    if (changes.dueAt <= start) return fail("invalid_range");
    Object.assign(changes, hoursFields(task, start, changes.dueAt, pc));
  }

  // An employee works on one task at a time: new dates or a new employee can't double-book.
  if (["dueAt", "plannedStart", "assignee"].some((k) => k in changes)) {
    const next = { ...task.toObject(), ...changes };
    if (holdsTime(next)) {
      const clash = await findOverlap(next.assignee, next.plannedStart, next.dueAt, [task._id]);
      if (clash) return fail("schedule_overlap", 409, { number: clash.number });
      // Not on the employee's approved leave.
      const leave = await leaveClash(next.assignee, next.plannedStart, next.dueAt, cal);
      if (leave) return fail("on_leave", 409, { date: leave });
    }
  }

  task.set(changes);
  await task.save();
  await logActivity(task._id, user, reassignedFrom ? "reassigned" : "edited", "", { fields: Object.keys(changes) });

  const enriched = await enrichTask(task);
  if (reassignedFrom) {
    const params = { actor: user.name || user.email, number: task.number, title: taskTitle(enriched) };
    await notify({ type: "task.reassigned", recipients: [reassignedFrom], actor: user, params, entityType: "task", entityId: task._id });
    await notify({
      type: "task.assigned",
      recipients: [changes.assignee],
      actor: user,
      params,
      link: `/dashboard/tasks?task=${task._id}`,
      entityType: "task",
      entityId: task._id,
    });
  }
  await publishTaskChange(task, reassignedFrom ? [reassignedFrom] : []);
  // Tasks waiting for this one move after its new time; new predecessors move it after them.
  if ("dueAt" in changes || changes.dependsOn) await cascadeFrom([...(changes.dependsOn || []), task._id], cal, user);
  if (reassignedFrom || "dueAt" in changes || changes.dependsOn) await trackDelays({ cause: reassignedFrom ? "reassigned" : "rescheduled", task }, user);

  return NextResponse.json({ task: enriched });
}
