// Cancelling and restoring tasks — the way MS Project inactivates a task. A cancelled
// task stays on the plan (greyed out, with the time already spent) but no longer takes
// its employee's time or holds up other work: tasks that waited for it wait for its own
// predecessors instead, so nothing is released before the work it really builds on is
// handed in. The GM / CEO can restore it. Project work is cancelled only by the GM /
// CEO: the employee (or their manager) asks, with a reason, and the GM / CEO decide.

import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { cascadeFrom, freeSlot, getWorkCalendar, personCalendar } from "@/lib/ganttServer";
import { finishTime, taskWorkMs } from "@/lib/gantt";
import { checkStageHandoffs } from "@/lib/projects";
import { syncStageDependencies } from "@/lib/taskSchedule";
import WorkProject from "@/models/WorkProject";
import { replanPaused, trackDelays } from "@/lib/projectDelay";
import { usersWithPermissionFor } from "@/lib/scope";
import { applyTransition, canStartNow, enrichTask, logActivity, notifyReady, publishTaskChange, taskTitle } from "@/lib/tasks";
import Task from "@/models/Task";

const idStr = (v) => (v ? v.toString() : null);

// After a stage task is cancelled or restored: the stages' tasks wait for the right work
// again, and stages that just unlocked are handed over.
async function syncStage(task, cal, user) {
  if (!task.project || !task.stage) return;
  const project = await WorkProject.findById(task.project);
  if (project) await syncStageDependencies(project, cal, user);
  await checkStageHandoffs(task.project, user);
}

// The GM / CEO: company-wide managers of projects.
const planners = () => usersWithPermissionFor("projects.manage", null);

async function tell(type, task, recipients, actor, extra = {}) {
  const ids = [...new Set(recipients.map(idStr))].filter((id) => id && id !== actor?.id);
  if (!ids.length) return;
  const enriched = await enrichTask(task);
  await notify({
    type,
    recipients: ids,
    actor,
    params: { actor: actor?.name || actor?.email || "", number: task.number, title: taskTitle(enriched), ...extra },
    link: `/dashboard/tasks?task=${task._id}`,
    entityType: "task",
    entityId: task._id,
  });
}

// The employee (or their manager) asks the GM / CEO to cancel project work.
export async function requestCancel(task, user, reason) {
  if (!["todo", "in_progress", "on_hold", "help"].includes(task.status)) return "invalid_transition";
  if (task.cancelRequest?.status === "pending") return "cancel_already_requested";
  task.cancelRequest = { status: "pending", by: user.id, at: new Date(), reason, decidedBy: null, decidedAt: null, note: "" };
  await task.save();
  await logActivity(task._id, user, "cancel_requested", reason);
  await tell("task.cancel_requested", task, await planners(), user, { reason });
  await publishTaskChange(task);
  return null;
}

// The GM / CEO turn down a cancellation request: the work goes on.
export async function rejectCancel(task, user, note) {
  if (task.cancelRequest?.status !== "pending") return "no_cancel_request";
  task.cancelRequest.status = "rejected";
  task.cancelRequest.decidedBy = user.id;
  task.cancelRequest.decidedAt = new Date();
  task.cancelRequest.note = note;
  await task.save();
  await logActivity(task._id, user, "cancel_rejected", note);
  await tell("task.cancel_rejected", task, [task.cancelRequest.by, task.assignee], user, { note });
  await publishTaskChange(task);
  return null;
}

// Cancels the task (the GM / CEO, a request they approved, or an employee's own
// meeting / personal task). Returns an error code or null.
export async function cancelTask(task, user, reason) {
  const now = new Date();
  const error = applyTransition(task, "cancel", now);
  if (error) return error;
  const requested = task.cancelRequest?.status === "pending";
  task.cancelledBy = user.id;
  task.cancelReason = reason || (requested ? task.cancelRequest.reason : "");
  if (requested) {
    task.cancelRequest.status = "approved";
    task.cancelRequest.decidedBy = user.id;
    task.cancelRequest.decidedAt = now;
  }

  // Waiting tasks now wait for what this task waited for (it no longer drives them).
  const successors = await Task.find({ dependsOn: task._id, status: "todo" });
  const preds = (task.dependsOn || []).map(idStr);
  for (const s of successors) {
    const ids = s.dependsOn.map(idStr).filter((id) => id !== idStr(task._id));
    s.dependsOn = [...new Set([...ids, ...preds])];
    await s.save();
  }
  task.cancelRelinked = successors.map((s) => s._id);
  await task.save();

  const cal = await getWorkCalendar();
  if (task.kind !== "meeting") await replanPaused(task.assignee, cal, user);
  await logActivity(task._id, user, "cancel", task.cancelReason, { requested });
  await audit(user, "task.cancelled", { entityType: "task", entityId: task._id, summary: `#${task.number}` });
  if (idStr(task.assignee) !== user.id) {
    await tell("task.cancelled", task, [task.assignee, requested ? task.cancelRequest.by : null], user, { reason: task.cancelReason });
  }
  await publishTaskChange(task);
  for (const s of successors) if (await canStartNow(s)) await notifyReady(s, notify);
  // A stage left with only cancelled work no longer holds up the stages after it: they
  // wait for what it waited for (lib/boardCells), and their departments are told.
  await syncStage(task, cal, user);
  await trackDelays({ cause: "cancelled", task, note: task.cancelReason }, user);
  return null;
}

// Brings a cancelled task back. Work never started goes into its employee's first free
// time once what it waits for is planned to finish; work already started comes back
// paused (with its time spent) and is planned after what they work on now. The tasks
// it held up wait for it again.
export async function restoreTask(task, user) {
  if (task.status !== "cancelled") return "invalid_transition";
  const started = Boolean(task.startedAt);
  const now = new Date();
  task.status = started ? "on_hold" : "todo";
  task.pausedAt = started ? now : null;
  task.cancelledAt = null;
  task.cancelledBy = null;
  task.cancelReason = "";
  task.cancelRequest = { status: "", by: null, at: null, reason: "", decidedBy: null, decidedAt: null, note: "" };
  const relinked = task.cancelRelinked || [];
  task.cancelRelinked = [];

  const cal = await getWorkCalendar();
  if (!started && task.kind !== "meeting") {
    const pc = await personCalendar(task.assignee, cal);
    const preds = task.dependsOn?.length ? await Task.find({ _id: { $in: task.dependsOn }, status: { $ne: "cancelled" } }).lean() : [];
    const ready = Math.max(now.getTime(), ...preds.map(finishTime));
    const slot = await freeSlot(task.assignee, ready, taskWorkMs(task, pc), cal, [task._id]);
    task.plannedStart = new Date(slot.start);
    task.dueAt = new Date(slot.end);
    task.dueReminderSent = false;
    task.overdueNotified = false;
  }
  await task.save();
  // Linked back only to tasks that haven't started yet.
  if (relinked.length) await Task.updateMany({ _id: { $in: relinked }, status: "todo" }, { $addToSet: { dependsOn: task._id } });

  if (started) await replanPaused(task.assignee, cal, user);
  await cascadeFrom([task._id], cal, user);
  await logActivity(task._id, user, "restored");
  await audit(user, "task.restored", { entityType: "task", entityId: task._id, summary: `#${task.number}` });
  await tell("task.restored", task, [task.assignee], user);
  await publishTaskChange(task);
  // The stage has work again: stages after it wait for it once more.
  await syncStage(task, cal, user);
  await trackDelays({ cause: "restored", task }, user);
  return null;
}
