import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { cascadeFrom, clearOverlaps, getWorkCalendar, personCalendar } from "@/lib/ganttServer";
import { canRouteStages, checkStageEmptied, checkStageHandoffs, isStageLocked } from "@/lib/projects";
import WorkProject from "@/models/WorkProject";
import { scaledDue } from "@/lib/projectScale";
import { insertRedo } from "@/lib/taskSchedule";
import { replanPaused, setHoursLeft, trackDelays } from "@/lib/projectDelay";
import { addWorkHours, holdsTime, HOUR, isRedo, nextWorkMoment, taskSpan, workMsBetween } from "@/lib/gantt";
import { getTaskSettings } from "@/lib/settings";
import {
  applyTransition,
  canManageTask,
  canReviewTask,
  enrichTask,
  logActivity,
  notifyPredecessorRejected,
  notifyUnblocked,
  openBlockers,
  publishTaskChange,
  reviewersFor,
  taskTitle,
} from "@/lib/tasks";
import { nextNumber } from "@/models/Counter";
import Task from "@/models/Task";
import User from "@/models/User";

const ASSIGNEE_ACTIONS = ["start", "pause", "resume", "help", "submit", "cancel", "hours_left"];

// Body: { action, ...fields }
//   start | pause | resume | cancel
//   help    { helperId, note, hours }          → creates a help task for the colleague,
//                                                planned in their schedule (default 1 h)
//   submit  { deliveryLink, employeeNotes }    → to the head (or done for meetings)
//   hours_left { hours }                       → work still going: when it's expected to finish
//   review  { decision: approve|reject, stars, ratings[], notes, rejectCause, newDueAt }
export async function POST(request, { params }) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const task = await Task.findById(id);
  if (!task) return notFound();

  const body = await readJson(request);
  const action = body.action;
  const isAssignee = task.assignee.toString() === user.id;
  const actorName = user.name || user.email;
  const now = new Date();

  if (action === "review") return review(user, task, body, now);

  if (!ASSIGNEE_ACTIONS.includes(action)) return fail("invalid_action");
  // Managers may cancel tasks in their scope; everything else is the assignee's.
  if (!isAssignee && !(action === "cancel" && canManageTask(user, task))) return forbidden();

  // The employee says how long the work still needs; the plan moves to match.
  if (action === "hours_left") {
    // Paused work is planned from its remaining hours (see replanPaused).
    if (!["in_progress", "help"].includes(task.status) || task.kind === "meeting") return fail("invalid_transition", 409);
    const hours = Math.round(Number(body.hours) * 2) / 2;
    if (!(hours >= 0.5 && hours <= 200)) return fail("invalid_task_hours");
    await setHoursLeft(task, hours, user);
    await logActivity(task._id, user, "hours_left", "", { hours });
    return NextResponse.json({ task: await enrichTask(task) });
  }

  let helper = null;
  if (action === "help") {
    if (!isObjectId(body.helperId) || body.helperId === user.id) return fail("invalid_helper");
    helper = await User.findOne({ _id: body.helperId, status: "active", role: { $ne: "user" } }).lean();
    if (!helper) return fail("invalid_helper");
  }
  if (action === "submit") {
    if (typeof body.deliveryLink === "string") task.deliveryLink = body.deliveryLink.trim().slice(0, 1000);
    if (typeof body.employeeNotes === "string") task.employeeNotes = body.employeeNotes.slice(0, 2000);
    // The Excel always carried a delivery-folder link for drawing tasks.
    if (["task", "revision"].includes(task.kind) && !task.deliveryLink) return fail("delivery_link_required");
  }

  if (action === "start") {
    const blockers = await openBlockers(task);
    if (blockers.length) return fail("blocked_by_dependency", 409, { numbers: blockers.map((b) => b.number) });
    // Ordered / mixed projects: a waiting stage can't start before the earlier stages finish.
    if (task.project && task.stage) {
      const project = await WorkProject.findById(task.project).lean();
      if (project && (await isStageLocked(project, task.stage))) return fail("stage_waiting", 409);
    }
  }

  // An employee works on one task at a time: pause the running one first.
  if ((action === "start" || action === "resume") && task.kind !== "meeting") {
    const running = await Task.findOne({ assignee: task.assignee, status: "in_progress", kind: { $ne: "meeting" }, _id: { $ne: task._id } }, { number: 1 }).lean();
    if (running) return fail("another_task_running", 409, { number: running.number });
  }
  // Rejected work comes first: with a redo waiting, the next task to start is the redo.
  // Work already going (paused, waiting for help) can still be resumed and finished.
  if (action === "start" && task.kind !== "meeting" && !isRedo(task)) {
    const redo = await Task.findOne({ assignee: task.assignee, status: "todo", revision: { $gt: 0 }, kind: { $ne: "meeting" }, _id: { $ne: task._id } }, { number: 1 })
      .sort({ createdAt: 1 })
      .lean();
    if (redo) return fail("redo_first", 409, { number: redo.number });
  }

  const error = applyTransition(task, action, now);
  if (error) return fail(error, 409);
  // Scaled project: the allowed hours count from the moment work starts.
  if (action === "start" && task.maxHours > 0 && !task.dueManual) {
    task.dueAt = scaledDue(now, task.maxHours, await personCalendar(task.assignee, await getWorkCalendar()));
    task.dueReminderSent = false;
    task.overdueNotified = false;
  }
  await task.save();
  // Its new due time can run into the employee's next planned tasks: they move later.
  // The tasks waiting for it (in anyone's plan) move after its new finish too.
  if (action === "start" && holdsTime(task)) {
    const cal = await getWorkCalendar();
    const moved = await clearOverlaps(task.assignee, cal, user);
    await cascadeFrom([task._id, ...moved], cal, user);
  }
  // Paused work can only go on after what the employee works on now.
  if (["start", "resume", "pause", "submit", "cancel"].includes(action) && task.kind !== "meeting") {
    await replanPaused(task.assignee, await getWorkCalendar(), user);
  }
  await logActivity(task._id, user, action, action === "help" ? String(body.note || "").slice(0, 1000) : "", {
    helperId: helper?._id?.toString(),
  });

  const enriched = await enrichTask(task);
  const notifyParams = { actor: actorName, number: task.number, title: taskTitle(enriched) };
  let extra = [];

  if (action === "help") {
    // The help takes the colleague's time: it goes into their schedule as soon as they're
    // free (after what they're working on now), pushing their other planned work later.
    const cal = await getWorkCalendar();
    const helpHours = Math.min(8, Math.max(0.5, Math.round((Number(body.hours) || 1) * 2) / 2));
    const helpStart = nextWorkMoment(now.getTime(), await personCalendar(helper._id, cal));
    const helpTask = await Task.create({
      number: await nextNumber("task"),
      kind: "help",
      title: String(body.note || "").trim().slice(0, 200) || `#${task.number}`,
      project: task.project,
      stage: task.stage,
      department: task.department,
      type: task.type,
      assignee: helper._id,
      createdBy: user.id,
      // A colleague is stuck until it's done.
      priority: "urgent",
      previousTask: task._id,
      plannedStart: new Date(helpStart),
      dueAt: new Date(addWorkHours(helpStart, helpHours, await personCalendar(helper._id, cal))),
      estimatedHours: helpHours,
    });
    const shifted = await clearOverlaps(helper._id, cal, user);
    if (shifted.length) await cascadeFrom(shifted, cal, user);
    await logActivity(helpTask._id, user, "created", "", { helpFor: task.number });
    await notify({
      type: "task.help_requested",
      recipients: [helper._id.toString()],
      actor: user,
      params: notifyParams,
      link: `/dashboard/tasks?task=${helpTask._id}`,
      entityType: "task",
      entityId: helpTask._id,
    });
    await publishTaskChange(helpTask);
  }

  if (action === "submit" && task.status === "submitted") {
    extra = await reviewersFor(task);
    await notify({
      type: "task.submitted",
      recipients: extra,
      actor: user,
      params: notifyParams,
      link: `/dashboard/reviews?task=${task._id}`,
      entityType: "task",
      entityId: task._id,
    });
  }

  await publishTaskChange(task, extra);
  if (action === "submit" || action === "cancel") await notifyUnblocked(task, notify);
  // Handed-in work releases the stages waiting for it (they don't wait for the review).
  if ((action === "submit" || action === "cancel") && task.project && task.stage) await checkStageHandoffs(task.project, user);
  // A stage left with no work holds up the stages after it: the GM / CEO must act.
  if (action === "cancel") await checkStageEmptied(task, user);
  // Starting, handing in or cancelling can move the projects' expected delivery.
  if (["start", "submit", "cancel"].includes(action)) {
    const cause = { start: "started", submit: "submitted", cancel: "cancelled" }[action];
    await trackDelays({ cause, task }, user);
  }
  return NextResponse.json({ task: enriched });
}

async function review(user, task, body, now) {
  if (!canReviewTask(user, task)) return forbidden();
  if (task.status !== "submitted") return fail("not_submitted", 409);
  if (!["approve", "reject"].includes(body.decision)) return fail("invalid_request");

  const settings = await getTaskSettings();
  const validTags = new Set(settings.ratingTags.map((r) => r.key));
  const ratings = [...new Set((Array.isArray(body.ratings) ? body.ratings : []).filter((r) => validTags.has(r)))];
  const approve = body.decision === "approve";
  // Every approved task carries a 1–5 star rating; on a rejection it is optional.
  const stars = Math.round(Number(body.stars));
  const validStars = stars >= 1 && stars <= 5;
  if (approve && !validStars) return fail("stars_required");

  task.stars = validStars ? stars : 0;
  task.status = approve ? "approved" : "rejected";
  task.reviewedBy = user.id;
  task.reviewedAt = now;
  task.ratings = ratings;
  task.headNotes = String(body.notes || "").slice(0, 2000);
  task.rejectCause = approve ? "" : ["employee", "management", "project"].includes(body.rejectCause) ? body.rejectCause : "employee";
  await task.save();
  await logActivity(task._id, user, approve ? "approved" : "rejected", task.headNotes, { ratings, stars: task.stars, rejectCause: task.rejectCause });
  await audit(user, approve ? "task.approved" : "task.rejected", { entityType: "task", entityId: task._id, summary: `#${task.number}` });

  const enriched = await enrichTask(task);
  const title = taskTitle(enriched);
  let revisionTask = null;

  if (approve) {
    await notify({
      type: "task.approved",
      recipients: [task.assignee.toString()],
      actor: user,
      params: { number: task.number, title },
      link: `/dashboard/tasks?task=${task._id}`,
      entityType: "task",
      entityId: task._id,
    });
  } else {
    // Rejection opens the next revision for the same person — the Excel "طلبات التعديلات".
    // The redo gets the same hours as the original and goes straight into the employee's
    // schedule, pushing their other planned tasks later (a custom date only from the GM / CEO).
    const cal = await getWorkCalendar();
    const span = taskSpan(task);
    const hours = task.maxHours || task.estimatedHours || Math.max(0.5, Math.round((workMsBetween(span.start, span.end, cal) / HOUR) * 2) / 2);
    const custom = body.newDueAt && canRouteStages(user) ? new Date(body.newDueAt) : null;
    revisionTask = await Task.create({
      number: await nextNumber("task"),
      kind: task.project && task.stage ? "revision" : task.kind,
      title: task.title,
      project: task.project,
      stage: task.stage,
      department: task.department,
      type: task.type,
      assignee: task.assignee,
      createdBy: user.id,
      priority: task.priority,
      revision: task.revision + 1,
      previousTask: task._id,
      maxHours: hours,
      estimatedHours: hours,
      dueManual: true,
      description: task.headNotes,
    });
    await insertRedo(revisionTask, hours, cal, user, custom && !Number.isNaN(custom.getTime()) ? custom : null);
    // Tasks waiting for the rejected task now wait for its redo (and move after it).
    await Task.updateMany({ dependsOn: task._id }, { $set: { "dependsOn.$": revisionTask._id } });
    await cascadeFrom([revisionTask._id], cal, user);
    await notifyPredecessorRejected(task, revisionTask, notify);
    await logActivity(revisionTask._id, user, "created", task.headNotes, { revisionOf: task.number });
    await notify({
      type: "task.rejected",
      recipients: [task.assignee.toString()],
      actor: user,
      params: { number: task.number, title, revision: String(revisionTask.revision).padStart(2, "0") },
      link: `/dashboard/tasks?task=${revisionTask._id}`,
      entityType: "task",
      entityId: revisionTask._id,
    });
    await publishTaskChange(revisionTask);
  }

  await publishTaskChange(task, [user.id]);
  // The next tasks and stages were released when the work was handed in. A rejection
  // locks the stages after it again until the redo is handed in.
  if (task.project && task.stage) await checkStageHandoffs(task.project, user);
  await trackDelays({ cause: approve ? "approved" : "rejected", task, note: approve ? "" : task.headNotes }, user);
  return NextResponse.json({ task: enriched, revisionTaskId: revisionTask?._id?.toString() || null });
}
