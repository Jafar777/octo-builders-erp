import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { notify } from "@/lib/notify";
import { cascadeFrom, clearOverlaps, getWorkCalendar, personCalendar } from "@/lib/ganttServer";
import { canRouteStages, checkStageHandoffs, isStageLocked } from "@/lib/projects";
import WorkProject from "@/models/WorkProject";
import PurchaseRequest from "@/models/PurchaseRequest";
import { scaledDue } from "@/lib/projectScale";
import { replanPaused, setHoursLeft, trackDelays } from "@/lib/projectDelay";
import { workMsBetween, addWorkHours, cancelNeedsApproval, holdsTime, isRedo, nextWorkMoment } from "@/lib/gantt";
import { cancelTask, rejectCancel, requestCancel, restoreTask } from "@/lib/taskCancel";
import { reviewTask, startReview } from "@/lib/taskReview";
import { claimed, pauseNeedsApproval, pauseRunning, requestPause } from "@/lib/hybridServer";
import { closeItemsForTask } from "@/lib/officeServer";
import {
  applyTransition,
  canManageTask,
  enrichTask,
  logActivity,
  canStartNow,
  changeBlockers,
  notifyUnblocked,
  openBlockers,
  publishTaskChange,
  taskTitle,
  managesAssignee,
} from "@/lib/tasks";
import { nextNumber } from "@/models/Counter";
import Task from "@/models/Task";
import { cleanDelivery, serverDeliveryRequired } from "@/lib/fileServer";
import User from "@/models/User";
import Role from "@/models/Role";
import { canWorkIn, TOP_ROLES } from "@/lib/permissions";
import { withWorkDepartments } from "@/lib/roles";

const idOf = (v) => (v ? v.toString() : null);

const ASSIGNEE_ACTIONS = ["start", "undo_start", "pause", "resume", "help", "submit", "hours_left"];

// Body: { action, ...fields }
//   start | resume
//   pause   { reason }                         → project work: asks the employee's manager
//                                                (or the CEO); it keeps running until approved
//   undo_start                                 → a start pressed by mistake (first 15 min):
//                                                back to its plan as if never started
//   cancel  { reason }                         → project work: the GM / CEO cancel it, anyone
//                                                else asks them; own meetings / personal tasks
//                                                are cancelled straight away
//   cancel_decision { decision: approve|reject, note }   (GM / CEO)
//   restore                                    → a cancelled task comes back (GM / CEO)
//   help    { helperId, note, hours }          → creates a help task for the colleague,
//                                                planned in their schedule (default 1 h)
//   submit  { deliveryLink, deliveryFiles[], employeeNotes }  → to the head (or done for
//                                                meetings); deliveryFiles = files / folders on
//                                                the company file server
//   hours_left { hours }                       → work still going: when it's expected to finish
//   review  { decision: approve|reject, stars, ratings[], notes, rejectCause, redoHours }
export async function POST(request, { params }) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const body = await readJson(request);
  try {
    // One start / resume at a time per employee (a double click, two tabs).
    if (["start", "resume"].includes(body.action)) {
      const owner = await Task.findById(id, { assignee: 1 }).lean();
      if (!owner) return notFound();
      const res = await claimed([`user:${owner.assignee}`], () => act(user, id, body));
      return res?.busy ? fail("start_busy", 409) : res;
    }
    return await act(user, id, body);
  } catch (err) {
    // Saved by someone else in the same moment.
    if (err?.name === "VersionError") return fail("task_changed", 409);
    throw err;
  }
}

async function act(user, id, body) {
  const task = await Task.findById(id);
  if (!task) return notFound();

  const action = body.action;
  const isAssignee = task.assignee.toString() === user.id;
  const actorName = user.name || user.email;
  const now = new Date();

  if (action === "review") return review(user, task, body, now);
  // (A change from the client after approval: app/api/tasks/[id]/client-change.)
  if (["cancel", "cancel_decision", "restore"].includes(action)) return cancelling(user, task, body, isAssignee);

  if (!ASSIGNEE_ACTIONS.includes(action)) return fail("invalid_action");
  // A department manager may start (or resume) the work of their department's employees.
  const onBehalf = !isAssignee && ["start", "resume"].includes(action) && (await managesAssignee(user, task));
  if (!isAssignee && !onBehalf) return forbidden();

  // Pausing project work is asked for first (lib/hybridServer.js requestPause).
  if (action === "pause" && pauseNeedsApproval(user, task)) {
    const res = await requestPause(user, task, body.reason);
    return res.error ? fail(res.error, 409) : NextResponse.json({ requested: true, task: await enrichTask(task) });
  }

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

  // Held for a client change to work it builds on: it goes on once that's handed in.
  if (["resume", "submit"].includes(action)) {
    const held = await changeBlockers(task);
    if (held.length) return fail("waiting_client_change", 409, { numbers: held.map((h) => h.number) });
  }

  let helper = null;
  if (action === "help") {
    if (!isObjectId(body.helperId) || body.helperId === user.id) return fail("invalid_helper");
    helper = await User.findOne({ _id: body.helperId, status: "active", role: { $nin: ["user", ...TOP_ROLES] } }).lean();
    if (!helper) return fail("invalid_helper");
    // A colleague who can work on it: not the GM / restricted roles (no task pages), and of
    // the task's department, the asker's own, or one the CEO opened to them (or merged).
    const helperRole = await Role.findOne({ key: helper.role }, { limited: 1 }).lean();
    if (!helperRole || helperRole.limited) return fail("invalid_helper");
    const [worker] = await withWorkDepartments([helper]);
    const sameTeam = Boolean(user.department) && idOf(helper.department) === user.department;
    if (!sameTeam && !canWorkIn(worker.work, task.department)) return fail("helper_other_department", 403);
  }
  if (action === "submit") {
    if (typeof body.deliveryLink === "string") task.deliveryLink = body.deliveryLink.trim().slice(0, 1000);
    if (typeof body.employeeNotes === "string") task.employeeNotes = body.employeeNotes.slice(0, 2000);
    if (body.deliveryFiles !== undefined) {
      const d = await cleanDelivery(user, task, body.deliveryFiles);
      if (d.error) return fail(d.error);
      task.deliveryFiles = d.refs;
    }
    // The Excel always carried a delivery-folder link for drawing tasks: now the files on
    // the company server, or a link (unless the company takes server deliveries only).
    if (["task", "revision"].includes(task.kind)) {
      if (!task.deliveryFiles?.length && (await serverDeliveryRequired())) return fail("delivery_files_required");
      if (!task.deliveryLink && !task.deliveryFiles?.length) return fail("delivery_link_required");
    }
  }

  if (action === "start") {
    const blockers = await openBlockers(task);
    if (blockers.length) return fail("blocked_by_dependency", 409, { numbers: blockers.map((b) => b.number) });
    // Ordered / mixed projects: a waiting stage can't start before the earlier stages finish.
    if (task.project && task.stage) {
      const project = await WorkProject.findById(task.project).lean();
      if (project && (await isStageLocked(project, task.stage, task))) return fail("stage_waiting", 409);
    }
    // Waiting for something to be bought (Purchasing): it can't start until it arrives.
    const purchase = await PurchaseRequest.findOne({ task: task._id, status: { $in: ["pending", "approved", "ordered"] } }, { number: 1 }).lean();
    if (purchase) return fail("waiting_purchase", 409, { number: purchase.number });
  }

  // An employee works on one task at a time. Project work they're on is paused only with
  // their manager's (or the CEO's) approval, never by starting something else; a task
  // without a project pauses by itself. A manager starting the work for them decides.
  let switchFrom = null;
  if ((action === "start" || action === "resume") && task.kind !== "meeting") {
    const running = await Task.findOne({ assignee: task.assignee, status: "in_progress", kind: { $ne: "meeting" }, _id: { $ne: task._id } }, { number: 1, project: 1 }).lean();
    if (running) {
      if (running.project && !onBehalf && pauseNeedsApproval(user, running)) return fail("another_task_running", 409, { number: running.number });
      switchFrom = running._id;
    }
    // Stopped by the end of the working day (not by an approved pause): that one goes on
    // first, so the clock stopping overnight isn't a way round the approval.
    if (!onBehalf && pauseNeedsApproval(user, task)) {
      const stopped = await Task.findOne({ assignee: task.assignee, status: "on_hold", autoPausedAt: { $ne: null }, project: { $ne: null }, _id: { $ne: task._id } }, { number: 1 }).lean();
      if (stopped) return fail("resume_paused_first", 409, { number: stopped.number });
    }
  }
  // Rejected work comes first: with a redo waiting, the next task to start is the redo.
  // Work already going (paused, waiting for help) can still be resumed and finished.
  if (action === "start" && task.kind !== "meeting" && !isRedo(task)) {
    const redos = await Task.find({ assignee: task.assignee, status: "todo", revision: { $gt: 0 }, revisionCause: { $nin: ["improvement", "correction"] }, kind: { $ne: "meeting" }, _id: { $ne: task._id }, "legacy.source": { $ne: "excel-redo" } })
      .sort({ createdAt: 1 })
      .lean();
    // A redo that itself waits for other work can't be started, so it doesn't come first.
    for (const redo of redos) if (await canStartNow(redo)) return fail("redo_first", 409, { number: redo.number });
  }

  // Held for a client change: the time it waited isn't the employee's.
  const heldSince = action === "resume" && task.waitsForChange?.length && task.promisedAt ? task.pausedAt : null;
  const madeByStart = action === "undo_start" && task.origin === "self" && !task.startUndo?.plannedStart;
  const error = applyTransition(task, action, now);
  if (error) return fail(error, 409);
  if (heldSince) {
    const pc = await personCalendar(task.assignee, await getWorkCalendar());
    task.promisedAt = new Date(addWorkHours(task.promisedAt.getTime(), workMsBetween(heldSince.getTime(), now.getTime(), pc) / 3600000, pc));
  }
  if (["start", "resume"].includes(action)) task.autoPausedAt = null;
  if (switchFrom) await pauseRunning(task.assignee, task._id, user);
  // Scaled project: the allowed hours count from the moment work starts.
  if (action === "start" && task.maxHours > 0 && !task.dueManual) {
    task.dueAt = scaledDue(now, task.maxHours, await personCalendar(task.assignee, await getWorkCalendar()));
    task.dueReminderSent = false;
    task.overdueNotified = false;
  }
  // Handed in: a cancellation it was waiting on no longer applies.
  if (action === "submit" && task.cancelRequest?.status === "pending") task.cancelRequest.status = "";
  await task.save();
  // Finished without a review (a meeting, a personal task): an office request made into
  // it is done too, and the office hears it.
  if (task.status === "done") await closeItemsForTask(task, user).catch((err) => console.error("closeItemsForTask", err));
  // Its new due time can run into the employee's next planned tasks: they move later.
  // The tasks waiting for it (in anyone's plan) move after its new finish too.
  if (action === "start" && holdsTime(task)) {
    const cal = await getWorkCalendar();
    const moved = await clearOverlaps(task.assignee, cal, user);
    await cascadeFrom([task._id, ...moved], cal, user);
  }
  // Paused work can only go on after what the employee works on now.
  // Back to its plan: other work it pushed may sit there now, and paused work moves up.
  // Work they started themselves by mistake was never planned: it goes away.
  if (action === "undo_start" && madeByStart) await cancelTask(task, user, "");
  if (action === "undo_start") {
    const cal = await getWorkCalendar();
    const moved = await clearOverlaps(task.assignee, cal, user);
    if (moved.length) await cascadeFrom(moved, cal, user);
  }
  if (["start", "undo_start", "resume", "pause", "submit"].includes(action) && task.kind !== "meeting") {
    await replanPaused(task.assignee, await getWorkCalendar(), user);
  }
  await logActivity(task._id, user, action, action === "help" ? String(body.note || "").slice(0, 1000) : "", {
    helperId: helper?._id?.toString(),
    onBehalf: onBehalf || undefined,
  });

  const enriched = await enrichTask(task);
  const notifyParams = { actor: actorName, number: task.number, title: taskTitle(enriched) };
  // Started by their manager: the employee is told.
  if (onBehalf) {
    await notify({
      type: "task.started_for_you",
      recipients: [task.assignee.toString()],
      actor: user,
      params: notifyParams,
      link: `/dashboard/tasks?task=${task._id}`,
      entityType: "task",
      entityId: task._id,
    });
  }
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
    if (shifted.length) {
      await cascadeFrom(shifted, cal, user);
      // The helper's moved work can move their projects' delivery.
      await trackDelays({ cause: "task_added", task: helpTask }, user);
    }
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

  // Handed in: the first of its reviewers (manager, GM / CEO or customer) is told.
  if (action === "submit" && task.status === "submitted") extra = await startReview(task, user);

  await publishTaskChange(task, extra);
  if (action === "submit") await notifyUnblocked(task, notify);
  // Handed-in work releases the stages waiting for it (they don't wait for the review).
  if (action === "submit" && task.project && task.stage) await checkStageHandoffs(task.project, user);
  // Starting (or taking a start back) and handing in can move the projects' expected delivery.
  if (["start", "undo_start", "submit"].includes(action)) {
    const cause = { start: "started", undo_start: "start_undone", submit: "submitted" }[action];
    await trackDelays({ cause, task }, user);
  }
  return NextResponse.json({ task: enriched });
}

// Cancelling (see lib/taskCancel). The GM / CEO cancel, decide on requests and restore;
// for project work everyone else asks them, with a reason.
async function cancelling(user, task, body, isAssignee) {
  const planner = canRouteStages(user);
  const reason = String(body.reason || body.note || "").trim().slice(0, 1000);
  let error;
  if (body.action === "restore") {
    if (!planner) return forbidden();
    error = await restoreTask(task, user);
  } else if (body.action === "cancel_decision") {
    if (!planner) return forbidden();
    if (task.cancelRequest?.status !== "pending") return fail("no_cancel_request", 409);
    if (body.decision === "approve") error = await cancelTask(task, user, reason);
    else if (body.decision === "reject") error = await rejectCancel(task, user, reason);
    else return fail("invalid_request");
  } else {
    if (!isAssignee && !planner && !canManageTask(user, task)) return forbidden();
    const needsApproval = cancelNeedsApproval(task);
    if (needsApproval && !reason && !(planner && task.cancelRequest?.status === "pending")) return fail("cancel_reason_required");
    error = planner || !needsApproval ? await cancelTask(task, user, reason) : await requestCancel(task, user, reason);
  }
  if (error) return fail(error, 409);
  return NextResponse.json({ task: await enrichTask(task) });
}

async function review(user, task, body, now) {
  const res = await reviewTask(user, task, body, now);
  if (res.error) return fail(res.error, res.status);
  return NextResponse.json({ task: res.task, revisionTaskId: res.revisionTaskId });
}
