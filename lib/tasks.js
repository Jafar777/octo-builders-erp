import mongoose from "mongoose";
import Task from "@/models/Task";
import TaskActivity from "@/models/TaskActivity";
import WorkProject from "@/models/WorkProject";
import User from "@/models/User";
import { hasPermission } from "@/lib/currentUser";
import { canUndoStart } from "@/lib/gantt";
import { DEFAULT_REVIEW } from "@/lib/reviewFlow";
import { isStageLocked } from "@/lib/projects";
import { inScope, usersWithPermissionFor } from "@/lib/scope";
import { publish, userChannel } from "@/lib/realtime/server";
import { pickName, viewerLang } from "@/lib/personName";

const idStr = (v) => (v ? v.toString() : null);

export const ACTIVE_STATUSES = ["todo", "in_progress", "on_hold", "help"];
export const FINAL_STATUSES = ["approved", "done", "cancelled"];
// Kinds that finish without the head's review.
export const NO_REVIEW_KINDS = ["meeting", "personal"];

export const departmentChannel = (id) => `private-department-${id}`;
// Every staff member listens here for the company-wide "Team tasks" board.
export const COMPANY_TASKS_CHANNEL = "private-company-tasks";
// A predecessor stops blocking once it is handed in (submitted), approved / done, or
// cancelled. The next tasks don't wait for the review: if the work is rejected, they
// wait again for its redo (R-01…), which goes first in the employee's schedule.
export const DEPENDENCY_DONE = ["submitted", "approved", "done", "cancelled"];

// ---------- access ----------

export function canReviewTask(user, task) {
  return (
    hasPermission(user, "tasks.review") &&
    inScope(user, task.department) &&
    idStr(task.assignee) !== user.id
  );
}

export function canManageTask(user, task) {
  return hasPermission(user, "tasks.assign") && inScope(user, task.department);
}

// Anyone involved, or managers whose scope covers the task's department.
export function isInvolvedInTask(user, task) {
  if (!user?.isStaff) return false;
  if (idStr(task.assignee) === user.id || idStr(task.createdBy) === user.id) return true;
  if (canReviewTask(user, task) || canManageTask(user, task)) return true;
  return hasPermission(user, "projects.view") && inScope(user, task.department);
}

// Tasks aren't secret: every staff member can see (and comment on) every task.
// Acting on a task still needs the checks above.
export function canViewTask(user) {
  return Boolean(user?.isStaff);
}

// The head's evaluation stays between the people involved.
export function hideReview(task) {
  return { ...task, ratings: [], stars: 0, headNotes: "", rejectCause: "", reviews: [] };
}

// ---------- time tracking ----------

function stopClock(task, now) {
  if (task.lastResumedAt) {
    task.activeMs += now - task.lastResumedAt;
    task.lastResumedAt = null;
  }
}

function endHold(task, now) {
  if (task.pausedAt) {
    task.holdMs += now - task.pausedAt;
    task.pausedAt = null;
  }
}

// Returns an error code or null. `task` is a Mongoose document; the caller saves it.
export function applyTransition(task, action, now = new Date()) {
  const s = task.status;
  switch (action) {
    case "start":
      if (s !== "todo") return "invalid_transition";
      // The plan it had, in case the start was a mistake (see "undo_start").
      if (!task.startedAt) task.startUndo = { plannedStart: task.plannedStart, dueAt: task.dueAt };
      task.status = "in_progress";
      task.startedAt = task.startedAt || now;
      task.lastResumedAt = now;
      return null;
    case "pause":
      if (s !== "in_progress") return "invalid_transition";
      stopClock(task, now);
      task.pausedAt = now;
      task.status = "on_hold";
      return null;
    case "help":
      if (s !== "in_progress" && s !== "on_hold") return "invalid_transition";
      stopClock(task, now);
      if (!task.pausedAt) task.pausedAt = now;
      task.status = "help";
      return null;
    case "resume":
      if (s !== "on_hold" && s !== "help") return "invalid_transition";
      endHold(task, now);
      task.lastResumedAt = now;
      task.status = "in_progress";
      return null;
    case "submit":
      if (!["in_progress", "on_hold", "help"].includes(s)) return "invalid_transition";
      stopClock(task, now);
      endHold(task, now);
      task.submittedAt = now;
      // Handed in: the overrun estimate is over (the bar ends at the hand-in).
      task.expectedEnd = null;
      task.status = NO_REVIEW_KINDS.includes(task.kind) ? "done" : "submitted";
      return null;
    case "undo_start":
      if (!canUndoStart(task, now.getTime())) return "undo_start_expired";
      task.status = "todo";
      task.startedAt = null;
      task.lastResumedAt = null;
      task.pausedAt = null;
      task.activeMs = 0;
      task.holdMs = 0;
      task.expectedEnd = null;
      if (task.startUndo?.plannedStart) {
        task.plannedStart = task.startUndo.plannedStart;
        task.dueAt = task.startUndo.dueAt;
      }
      task.startUndo = { plannedStart: null, dueAt: null };
      return null;
    case "cancel":
      if (!ACTIVE_STATUSES.includes(s)) return "invalid_transition";
      stopClock(task, now);
      endHold(task, now);
      task.status = "cancelled";
      task.cancelledAt = now;
      task.expectedEnd = null;
      return null;
    default:
      return "invalid_action";
  }
}

// ---------- dependencies, sub-tasks, repeating tasks ----------

// Tasks still blocking this one.
export async function openBlockers(task) {
  if (!task.dependsOn?.length) return [];
  return Task.find({ _id: { $in: task.dependsOn }, status: { $nin: DEPENDENCY_DONE } }, { number: 1 }).lean();
}

// True if `taskId` is (directly or indirectly) a predecessor of any of `candidateIds`'s
// own predecessors — i.e. adding them would create a loop.
export async function createsCycle(taskId, candidateIds) {
  const target = idStr(taskId);
  let frontier = candidateIds.map(String);
  const seen = new Set();
  for (let depth = 0; frontier.length && depth < 50; depth += 1) {
    if (frontier.includes(target)) return true;
    frontier.forEach((id) => seen.add(id));
    const next = await Task.find({ _id: { $in: frontier } }, { dependsOn: 1 }).lean();
    frontier = [...new Set(next.flatMap((t) => (t.dependsOn || []).map(String)))].filter((id) => !seen.has(id));
  }
  return false;
}

// Validates a list of predecessor IDs for a task. Returns { ids } or { error }.
export async function cleanDependsOn(value, taskId = null) {
  const asked = [...new Set((Array.isArray(value) ? value : []).map(String))].filter((id) => /^[a-f\d]{24}$/i.test(id) && id !== idStr(taskId));
  if (!asked.length) return { ids: [] };
  const found = await Task.find({ _id: { $in: asked } }, { status: 1 }).lean();
  if (found.length !== asked.length) return { error: "invalid_dependency" };
  // A cancelled task holds nothing up (lib/taskCancel), so it's never a predecessor.
  const live = new Set(found.filter((t) => t.status !== "cancelled").map((t) => idStr(t._id)));
  const ids = asked.filter((id) => live.has(id));
  if (taskId && ids.length && (await createsCycle(taskId, ids))) return { error: "dependency_cycle" };
  return { ids };
}

// Can a not-started task start right now: nothing it depends on is still open, and its
// stage isn't waiting for earlier stages.
export async function canStartNow(task) {
  if ((await openBlockers(task)).length) return false;
  if (!task.project || !task.stage) return true;
  const project = await WorkProject.findById(task.project, { stages: 1, overrides: 1 }).lean();
  return !project || !(await isStageLocked(project, task.stage));
}

// Tells a task's employee that it can start now.
export async function notifyReady(w, notify) {
  const [enriched] = await enrichTasks([w.toObject ? w.toObject() : w]);
  await notify({
    type: "task.unblocked",
    recipients: [idStr(w.assignee)],
    params: { number: w.number, title: taskTitle(enriched) },
    link: `/dashboard/tasks?task=${w._id}`,
    entityType: "task",
    entityId: w._id,
  });
  await publishTaskChange(w);
}

// After a task finishes, tell the people whose tasks were waiting for it and can now
// start (a stage still waiting for other work doesn't count).
export async function notifyUnblocked(task, notify) {
  if (!DEPENDENCY_DONE.includes(task.status)) return;
  const waiting = await Task.find({ dependsOn: task._id, status: "todo" }).lean();
  for (const w of waiting) if (await canStartNow(w)) await notifyReady(w, notify);
}

// After `task` is rejected (its successors now wait for `redo`): tell the people whose
// tasks came after it. Those who already started keep going but know the work they
// built on is being redone; the rest wait again until the redo is handed in.
export async function notifyPredecessorRejected(task, redo, notify) {
  const after = await Task.find({ dependsOn: redo._id, status: { $in: [...ACTIVE_STATUSES, "submitted"] } }).lean();
  const revision = String(redo.revision).padStart(2, "0");
  for (const w of after) {
    const [enriched] = await enrichTasks([w]);
    await notify({
      type: "task.predecessor_rejected",
      recipients: [idStr(w.assignee)],
      params: { number: w.number, title: taskTitle(enriched), rejected: task.number, revision, started: w.status !== "todo" },
      link: `/dashboard/tasks?task=${w._id}`,
      entityType: "task",
      entityId: w._id,
    });
    await publishTaskChange(w);
  }
}

export const RECURRENCE_FREQS = ["daily", "weekly", "monthly"];

export function addInterval(date, freq, interval = 1) {
  const d = new Date(date);
  if (freq === "daily") d.setUTCDate(d.getUTCDate() + interval);
  if (freq === "weekly") d.setUTCDate(d.getUTCDate() + 7 * interval);
  if (freq === "monthly") d.setUTCMonth(d.getUTCMonth() + interval);
  return d;
}

// Validates a repeat rule for a task due at `dueAt`. Returns { value } or { error }.
export function cleanRecurrence(rule, dueAt) {
  if (!rule || !rule.freq) return { value: { freq: "", interval: 1, until: null, nextAt: null } };
  if (!RECURRENCE_FREQS.includes(rule.freq)) return { error: "invalid_recurrence" };
  if (!dueAt) return { error: "due_required" };
  const interval = Math.round(Number(rule.interval) || 1);
  if (interval < 1 || interval > 12) return { error: "invalid_recurrence" };
  const until = rule.until ? new Date(rule.until) : null;
  if (until && Number.isNaN(until.getTime())) return { error: "invalid_date" };
  return { value: { freq: rule.freq, interval, until, nextAt: addInterval(dueAt, rule.freq, interval) } };
}

// ---------- activity, realtime ----------

export async function logActivity(taskId, actor, type, text = "", data = {}) {
  await TaskActivity.create({ task: taskId, actor: actor?.id || actor || null, type, text, data });
}

export async function reviewersFor(task) {
  const ids = await usersWithPermissionFor("tasks.review", task.department);
  return ids.filter((id) => id !== idStr(task.assignee));
}

// Everyone looking at a board or task list refreshes the affected task.
export async function publishTaskChange(task, extraUserIds = []) {
  const users = [idStr(task.assignee), idStr(task.createdBy), ...extraUserIds].filter(Boolean);
  const channels = [COMPANY_TASKS_CHANNEL, ...[...new Set(users)].map((id) => userChannel(id))];
  if (task.department) channels.push(departmentChannel(idStr(task.department)));
  // Same name as projectChannel() in lib/projects.
  if (task.project) channels.push(`private-project-${idStr(task.project)}`);
  await publish(channels, "task:updated", {
    id: idStr(task._id),
    projectId: idStr(task.project),
    status: task.status,
  });
}

// ---------- serialization ----------

function isLate(t, now = Date.now()) {
  if (!t.dueAt) return false;
  const end = t.submittedAt ? new Date(t.submittedAt).getTime() : now;
  return end > new Date(t.dueAt).getTime() && !["cancelled"].includes(t.status);
}

// A person's overall star rating: the average of every star-rated task they did.
export async function starSummary(userId) {
  const [row] = await Task.aggregate([
    { $match: { assignee: new mongoose.Types.ObjectId(userId), stars: { $gte: 1 } } },
    { $group: { _id: null, average: { $avg: "$stars" }, count: { $sum: 1 } } },
  ]);
  return { average: row ? Math.round(row.average * 10) / 10 : 0, count: row?.count || 0 };
}

// Adds project / item / stage / people names so screens need no extra lookups.
export async function enrichTasks(tasks) {
  const projectIds = [...new Set(tasks.map((t) => idStr(t.project)).filter(Boolean))];
  const depIds = [...new Set(tasks.flatMap((t) => (t.dependsOn || []).map(idStr)))];
  const parentIds = [...new Set(tasks.map((t) => idStr(t.parentTask)).filter(Boolean))];
  const [deps, subCounts] = await Promise.all([
    depIds.length || parentIds.length
      ? Task.find({ _id: { $in: [...depIds, ...parentIds] } }, { number: 1, status: 1, title: 1 }).lean()
      : [],
    Task.aggregate([
      { $match: { parentTask: { $in: tasks.map((t) => t._id) } } },
      { $group: { _id: "$parentTask", total: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 0, 1] } }, done: { $sum: { $cond: [{ $in: ["$status", ["approved", "done"]] }, 1, 0] } } } },
    ]),
  ]);
  const depMap = Object.fromEntries(deps.map((d) => [d._id.toString(), { id: d._id.toString(), number: d.number, status: d.status, title: d.title }]));
  const subMap = Object.fromEntries(subCounts.map((c) => [c._id.toString(), { total: c.total, done: c.done }]));
  const userIds = [
    ...new Set(
      tasks
        .flatMap((t) => [
          idStr(t.assignee),
          idStr(t.createdBy),
          idStr(t.reviewedBy),
          idStr(t.cancelledBy),
          idStr(t.cancelRequest?.by),
          idStr(t.cancelRequest?.decidedBy),
          ...(t.reviews || []).map((r) => idStr(r.by)),
        ])
        .filter(Boolean)
    ),
  ];
  const [projects, users] = await Promise.all([
    WorkProject.find({ _id: { $in: projectIds } }, { name: 1, code: 1, stages: 1 }).lean(),
    User.find({ _id: { $in: userIds } }, { name: 1, nameAr: 1, email: 1, avatarUrl: 1 }).lean(),
  ]);
  const lang = await viewerLang();
  const projectMap = Object.fromEntries(projects.map((p) => [p._id.toString(), p]));
  const userMap = Object.fromEntries(
    users.map((u) => [u._id.toString(), { id: u._id.toString(), name: pickName(u, lang), avatarUrl: u.avatarUrl || "" }])
  );

  return tasks.map((t) => {
    const p = projectMap[idStr(t.project)];
    const stage = p?.stages.find((s) => s.key === t.stage);
    return {
      id: t._id.toString(),
      number: t.number,
      kind: t.kind,
      title: t.title,
      project: p ? { id: p._id.toString(), name: p.name, code: p.code } : null,
      stage: stage ? { key: stage.key, name: stage.name } : null,
      department: idStr(t.department),
      type: t.type,
      assignee: userMap[idStr(t.assignee)] || null,
      createdBy: userMap[idStr(t.createdBy)] || null,
      priority: t.priority,
      revision: t.revision,
      previousTaskId: idStr(t.previousTask),
      status: t.status,
      plannedStart: t.plannedStart,
      dueAt: t.dueAt,
      estimatedHours: t.estimatedHours,
      maxHours: t.maxHours || 0,
      dueManual: Boolean(t.dueManual),
      baselineStart: t.baselineStart || null,
      baselineEnd: t.baselineEnd || null,
      expectedEnd: t.expectedEnd || null,
      deliveryLink: t.deliveryLink,
      attachments: t.attachments || [],
      description: t.description,
      employeeNotes: t.employeeNotes,
      startedAt: t.startedAt,
      lastResumedAt: t.lastResumedAt,
      pausedAt: t.pausedAt,
      activeMs: t.activeMs,
      holdMs: t.holdMs,
      submittedAt: t.submittedAt,
      reviewedBy: userMap[idStr(t.reviewedBy)] || null,
      reviewedAt: t.reviewedAt,
      ratings: t.ratings || [],
      stars: t.stars || 0,
      headNotes: t.headNotes,
      rejectCause: t.rejectCause,
      // Who reviews it (lib/reviewFlow), the level it waits for while handed in, and each review.
      review: { ...DEFAULT_REVIEW, ...(t.review || {}) },
      reviewLevel: t.status === "submitted" ? t.reviewLevel || "manager" : "",
      reviews: (t.reviews || []).map((r) => ({
        level: r.level,
        by: userMap[idStr(r.by)] || null,
        at: r.at,
        decision: r.decision,
        stars: r.stars || 0,
        ratings: r.ratings || [],
        notes: r.notes || "",
        rejectCause: r.rejectCause || "",
        onBehalf: Boolean(r.onBehalf),
      })),
      late: isLate(t),
      cancelRequest: t.cancelRequest?.status
        ? {
            status: t.cancelRequest.status,
            by: userMap[idStr(t.cancelRequest.by)] || null,
            at: t.cancelRequest.at,
            reason: t.cancelRequest.reason,
            decidedBy: userMap[idStr(t.cancelRequest.decidedBy)] || null,
            decidedAt: t.cancelRequest.decidedAt,
            note: t.cancelRequest.note,
          }
        : null,
      cancelledAt: t.cancelledAt || null,
      cancelledBy: userMap[idStr(t.cancelledBy)] || null,
      cancelReason: t.cancelReason || "",
      dependsOn: (t.dependsOn || []).map((d) => depMap[idStr(d)]).filter(Boolean),
      blocked: t.status === "todo" && (t.dependsOn || []).some((d) => depMap[idStr(d)] && !DEPENDENCY_DONE.includes(depMap[idStr(d)].status)),
      parentTask: t.parentTask ? depMap[idStr(t.parentTask)] || null : null,
      subtasks: subMap[idStr(t._id)] || null,
      recurrence: t.recurrence?.freq ? { freq: t.recurrence.freq, interval: t.recurrence.interval, until: t.recurrence.until, nextAt: t.recurrence.nextAt } : null,
      recurrenceOf: idStr(t.recurrenceOf),
      createdAt: t.createdAt,
    };
  });
}

export async function enrichTask(task) {
  return (await enrichTasks([task.toObject ? task.toObject() : task]))[0];
}

// Short plain label used in notifications ("Kitchen layout · CAD").
export function taskTitle(t) {
  if (t.title && !t.stage) return t.title;
  return [t.title, t.stage?.name?.en, t.project?.code || t.project?.name?.en].filter(Boolean).join(" · ") || "—";
}
