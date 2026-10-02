import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { notify } from "@/lib/notify";
import {
  canManageTask,
  canReviewTask,
  canViewTask,
  cleanDependsOn,
  cleanRecurrence,
  enrichTask,
  FINAL_STATUSES,
  logActivity,
  publishTaskChange,
  taskTitle,
} from "@/lib/tasks";
import Task from "@/models/Task";
import TaskActivity from "@/models/TaskActivity";
import User from "@/models/User";

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
    // All revisions of the same board cell, newest first.
    task.project && task.item && task.stage
      ? Task.find(
          { project: task.project, item: task.item, stage: task.stage, kind: { $in: ["task", "revision"] } },
          { number: 1, revision: 1, status: 1, assignee: 1, ratings: 1, submittedAt: 1 }
        )
          .sort({ revision: -1 })
          .lean()
      : [],
  ]);
  const actorIds = [...new Set(activity.map((a) => a.actor?.toString()).filter(Boolean))];
  const actors = await User.find({ _id: { $in: actorIds } }, { name: 1, email: 1 }).lean();
  const names = Object.fromEntries(actors.map((a) => [a._id.toString(), a.name || a.email]));

  return NextResponse.json({
    task: await enrichTask(task),
    permissions: {
      isAssignee: task.assignee.toString() === user.id,
      canPlan: canManageTask(user, task) || (task.assignee.toString() === user.id && task.createdBy.toString() === user.id),
      canReview: canReviewTask(user, task),
      canManage: canManageTask(user, task),
    },
    activity: activity.map((a) => ({
      id: a._id.toString(),
      type: a.type,
      text: a.text,
      data: a.data,
      actorName: names[a.actor?.toString()] || "—",
      createdAt: a.createdAt,
    })),
    history: history.map((h) => ({
      id: h._id.toString(),
      number: h.number,
      revision: h.revision,
      status: h.status,
      ratings: h.ratings,
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
  const canManage = canManageTask(user, task);
  if (!isAssignee && !canManage) return forbidden();
  const body = await readJson(request);
  // A finished task can still have its repeat rule stopped.
  const onlyRecurrence = Object.keys(body).length === 1 && "recurrence" in body;
  if (FINAL_STATUSES.includes(task.status) && !onlyRecurrence) return fail("task_closed");

  const changes = {};
  if (typeof body.deliveryLink === "string") changes.deliveryLink = body.deliveryLink.trim().slice(0, 1000);
  if (typeof body.employeeNotes === "string") changes.employeeNotes = body.employeeNotes.slice(0, 2000);
  if (body.estimatedHours !== undefined) changes.estimatedHours = Math.max(0, Math.min(1000, Number(body.estimatedHours) || 0));

  // Planning fields: managers, or the owner of a task they created for themselves.
  const ownsTask = isAssignee && task.createdBy.toString() === user.id;
  if (canManage || ownsTask) {
    if (body.dependsOn !== undefined) {
      const deps = await cleanDependsOn(body.dependsOn, task._id);
      if (deps.error) return fail(deps.error);
      changes.dependsOn = deps.ids;
    }
    if (body.recurrence !== undefined) {
      if (task.item) return fail("invalid_recurrence");
      const rec = cleanRecurrence(body.recurrence, body.dueAt ? new Date(body.dueAt) : task.dueAt);
      if (rec.error) return fail(rec.error);
      changes.recurrence = rec.value;
    }
  }

  let reassignedFrom = null;
  if (canManage) {
    if (body.dueAt !== undefined) {
      const d = body.dueAt ? new Date(body.dueAt) : null;
      if (d && Number.isNaN(d.getTime())) return fail("invalid_date");
      changes.dueAt = d;
      changes.dueReminderSent = false;
      changes.overdueNotified = false;
    }
    if (["normal", "important", "urgent"].includes(body.priority)) changes.priority = body.priority;
    if (typeof body.description === "string") changes.description = body.description.slice(0, 4000);
    if (isObjectId(body.assigneeId) && body.assigneeId !== task.assignee.toString()) {
      const next = await User.exists({ _id: body.assigneeId, status: "active", role: { $ne: "user" } });
      if (!next) return fail("invalid_assignee");
      if (task.status !== "todo") return fail("reassign_only_todo");
      reassignedFrom = task.assignee.toString();
      changes.assignee = body.assigneeId;
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

  return NextResponse.json({ task: enriched });
}
