import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { notify } from "@/lib/notify";
import { finishTime, holdsTime, HOUR } from "@/lib/gantt";
import { cascadeFrom, clearOverlaps, findOverlap, freeSlot, getWorkCalendar } from "@/lib/ganttServer";
import { trackDelays } from "@/lib/projectDelay";
import { syncStageDependencies } from "@/lib/taskSchedule";
import { canRouteStages, isStageLocked, projectAccess, stageDepartment } from "@/lib/projects";
import { getTaskSettings } from "@/lib/settings";
import { inScope } from "@/lib/scope";
import {
  canManageTask,
  canViewTask,
  cleanDependsOn,
  ACTIVE_STATUSES,
  cleanRecurrence,
  enrichTask,
  enrichTasks,
  hideReview,
  isInvolvedInTask,
  logActivity,
  publishTaskChange,
  starSummary,
  taskTitle,
} from "@/lib/tasks";
import { nextNumber } from "@/models/Counter";
import Task, { TASK_STATUSES } from "@/models/Task";
import User from "@/models/User";
import WorkProject from "@/models/WorkProject";
import { queueQuery } from "@/lib/taskReview";
import { cleanReviewFlags } from "@/lib/reviewFlow";

// Views:
//   ?view=mine            my tasks (default)
//   ?view=review          submitted tasks I may review
//   ?view=project&project=<id>
//   ?view=all             everything in my scope (managers)
//   ?view=team            everyone's open work, company-wide (all staff)
//   ?view=subtasks&parent=<id>
// Optional: &status=a,b  &assignee=<id>
export async function GET(request) {
  const user = await requireStaff();
  if (!user) return forbidden();

  const params = new URL(request.url).searchParams;
  const view = params.get("view") || "mine";
  const query = {};

  if (view === "mine") {
    query.assignee = user.id;
  } else if (view === "review") {
    // The work waiting for my level of review (lib/taskReview).
    const queue = await queueQuery(user);
    if (!queue) return forbidden();
    Object.assign(query, queue);
  } else if (view === "project") {
    const projectId = params.get("project");
    if (!isObjectId(projectId)) return fail("invalid_request");
    const project = await WorkProject.findById(projectId).lean();
    if (!projectAccess(user, project)) return forbidden();
    query.project = projectId;
  } else if (view === "subtasks") {
    const parent = isObjectId(params.get("parent")) ? await Task.findById(params.get("parent")).lean() : null;
    if (!parent || !canViewTask(user, parent)) return forbidden();
    query.parentTask = parent._id;
  } else if (view === "team") {
    query.status = { $in: [...ACTIVE_STATUSES, "submitted"] };
  } else if (view === "all") {
    if (!hasPermission(user, "projects.view") && !hasPermission(user, "tasks.assign")) return forbidden();
    if (user.scope !== "all") query.department = user.department;
  } else {
    return fail("invalid_request");
  }

  const statuses = (params.get("status") || "").split(",").filter((s) => TASK_STATUSES.includes(s));
  if (statuses.length && !query.status) query.status = { $in: statuses };
  const assignee = params.get("assignee");
  if (isObjectId(assignee) && view !== "mine") query.assignee = assignee;

  const tasks = await Task.find(query).sort({ updatedAt: -1 }).limit(view === "team" ? 2000 : 500).lean();
  const enriched = await enrichTasks(tasks);
  return NextResponse.json({
    tasks: enriched.map((t, i) => (isInvolvedInTask(user, tasks[i]) ? t : hideReview(t))),
    // My overall star rating, shown at the top of "My tasks".
    rating: view === "mine" ? await starSummary(user.id) : undefined,
  });
}

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// Create a task. Staff create tasks for themselves (the Excel "manual entry");
// people with tasks.assign may assign to others in their scope.
export async function POST(request) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const body = await readJson(request);
  const settings = await getTaskSettings();

  const kind = ["task", "meeting", "personal"].includes(body.kind) ? body.kind : "task";
  const assigneeId = isObjectId(body.assigneeId) ? body.assigneeId : user.id;
  const assignee = await User.findOne({ _id: assigneeId, status: "active", role: { $ne: "user" } }).lean();
  if (!assignee) return fail("invalid_assignee");

  // Sub-task: belongs to a parent task and inherits its project.
  let parent = null;
  if (body.parentTaskId) {
    parent = isObjectId(body.parentTaskId) ? await Task.findById(body.parentTaskId).lean() : null;
    if (!parent || !isInvolvedInTask(user, parent)) return fail("invalid_parent");
    if (parent.parentTask) return fail("nested_subtask");
    body.projectId = parent.project ? parent.project.toString() : "";
    body.stage = "";
  }

  let project = null;
  let stage = null;
  if (isObjectId(body.projectId)) {
    project = await WorkProject.findById(body.projectId).lean();
    if (!project || !projectAccess(user, project)) return fail("invalid_project");
    if (["finished", "archived"].includes(project.status)) return fail("project_closed");
    if (body.stage) {
      stage = project.stages.find((s) => s.key === body.stage);
      if (!stage) return fail("invalid_cell");
      // A stage waiting for the earlier stages can't get work yet.
      if (await isStageLocked(project, stage.key)) return fail("stage_waiting", 409);
    }
  } else if (kind === "task" && !parent) {
    return fail("project_required");
  }

  // Board work belongs to the department doing the stage (it reviews it and it counts in its KPI).
  const department =
    parent?.department || (project && stage ? stageDepartment(project, stage) : project?.department) || assignee.department || user.department || null;
  if (assigneeId !== user.id && !(hasPermission(user, "tasks.assign") && inScope(user, department))) {
    return forbidden();
  }

  const type = settings.taskTypes.some((t) => t.key === body.type) ? body.type : stage?.taskType || "other";
  // Time is set by the system: only the GM / CEO may give dates, hours, predecessors
  // or a repeat rule. Everyone else's work starts counting when they press Start.
  const isScheduler = canRouteStages(user);
  let dueAt = isScheduler ? parseDate(body.dueAt) : null;
  let plannedStart = isScheduler ? parseDate(body.plannedStart) : null;
  if (dueAt === undefined || plannedStart === undefined) return fail("invalid_date");
  let estimatedHours = isScheduler ? Math.max(0, Math.min(1000, Number(body.estimatedHours) || 0)) : 0;
  if (!isScheduler) {
    body.dependsOn = [];
    body.recurrence = null;
  }

  // Project tasks: the creator sets the working hours, and the task is scheduled in
  // the employee's queue (after the work they already have planned).
  let maxHours = 0;
  let dueManual = false;
  // Project work and its hours are set by the GM / CEO. Anyone else can break a task
  // they work on into sub-tasks: steps inside its time, with no hours of their own.
  const step = Boolean(parent) && !isScheduler;
  if (kind === "task" && project && !isScheduler && !parent) return fail("hours_by_ceo", 403);
  if (kind === "task" && project && !step) {
    const hours = Number(body.hours);
    if (Number.isFinite(hours) && hours >= 0.5 && hours <= 200) maxHours = Math.round(hours * 2) / 2;
    else if (!(isScheduler && dueAt)) return fail("invalid_task_hours");
  }
  const deps = await cleanDependsOn(body.dependsOn);
  if (deps.error) return fail(deps.error);
  // Who reviews project work: the GM / CEO choose (manager, GM / CEO, customer); otherwise the manager.
  const review = kind === "task" && project && isScheduler && !parent ? cleanReviewFlags(body.review, { hasCustomer: Boolean(project.customer) }) : cleanReviewFlags(null);
  if (review.error) return fail(review.error);
  if (maxHours) {
    dueManual = true;
    estimatedHours = maxHours;
    if (!dueAt) {
      // The employee's first free time that fits (from the chosen start, if any), once
      // the tasks it waits for are planned to finish.
      const preds = deps.ids.length ? await Task.find({ _id: { $in: deps.ids }, status: { $ne: "cancelled" } }).lean() : [];
      const earliest = Math.max(Date.now(), plannedStart?.getTime() || 0, ...preds.map(finishTime));
      const slot = await freeSlot(assigneeId, earliest, maxHours * HOUR, await getWorkCalendar());
      plannedStart = new Date(slot.start);
      dueAt = new Date(slot.end);
    }
  }
  if (kind === "task" && !dueAt && !step) return fail("due_required");
  // An employee works on one task at a time.
  if (holdsTime({ kind, status: "todo", plannedStart, dueAt })) {
    const clash = await findOverlap(assigneeId, plannedStart, dueAt);
    if (clash) return fail("schedule_overlap", 409, { number: clash.number });
  }

  // Stage tasks follow the revision chain, so they can't repeat.
  const recurrence = stage ? cleanRecurrence(null) : cleanRecurrence(body.recurrence, dueAt);
  if (recurrence.error) return fail(recurrence.error);

  const task = await Task.create({
    number: await nextNumber("task"),
    kind,
    title: String(body.title || "").trim().slice(0, 200),
    project: project?._id || null,
    stage: stage?.key || "",
    department,
    type,
    assignee: assigneeId,
    createdBy: user.id,
    priority: ["normal", "important", "urgent"].includes(body.priority) ? body.priority : "normal",
    revision: 0,
    plannedStart,
    dueAt,
    estimatedHours,
    maxHours,
    dueManual,
    description: String(body.description || "").slice(0, 4000),
    deliveryLink: String(body.deliveryLink || "").trim().slice(0, 1000),
    parentTask: parent?._id || null,
    dependsOn: deps.ids,
    recurrence: recurrence.value,
    review: review.value,
  });

  await logActivity(task._id, user, "created");
  if (parent) await logActivity(parent._id, user, "subtask_added", "", { number: task.number });
  // New stage work: the stages after it wait for it too, and it waits for the stages
  // before it (it may move after them).
  if (project && stage) await syncStageDependencies(project, await getWorkCalendar(), user);
  const enriched = await enrichTask(project && stage ? await Task.findById(task._id) : task);

  if (assigneeId !== user.id) {
    await notify({
      type: "task.assigned",
      recipients: [assigneeId],
      actor: user,
      params: { actor: user.name || user.email, number: task.number, title: taskTitle(enriched) },
      link: `/dashboard/tasks?task=${task._id}`,
      entityType: "task",
      entityId: task._id,
    });
  }
  await publishTaskChange(task);
  if (parent) await publishTaskChange(parent);
  // A meeting takes the employee's time: planned work it lands on moves after it.
  if (kind === "meeting" && plannedStart && dueAt) {
    const cal = await getWorkCalendar();
    const moved = await clearOverlaps(assigneeId, cal, user);
    if (moved.length) await cascadeFrom(moved, cal, user);
  }
  if ((project || kind === "meeting") && dueAt) await trackDelays({ cause: "task_added", task }, user);

  return NextResponse.json({ task: enriched, canManage: canManageTask(user, task) }, { status: 201 });
}
