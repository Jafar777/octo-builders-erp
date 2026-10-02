import mongoose from "mongoose";
import Task from "@/models/Task";
import TaskActivity from "@/models/TaskActivity";
import WorkProject from "@/models/WorkProject";
import User from "@/models/User";
import { hasPermission } from "@/lib/currentUser";
import { inScope, usersWithPermissionFor } from "@/lib/scope";
import { publish, userChannel } from "@/lib/realtime/server";

const idStr = (v) => (v ? v.toString() : null);

export const ACTIVE_STATUSES = ["todo", "in_progress", "on_hold", "help"];
export const FINAL_STATUSES = ["approved", "done", "cancelled"];
// Kinds that finish without the head's review.
export const NO_REVIEW_KINDS = ["meeting", "personal"];

export const departmentChannel = (id) => `private-department-${id}`;
// A predecessor counts as finished once approved / done (or cancelled — it no longer blocks).
export const DEPENDENCY_DONE = ["approved", "done", "cancelled"];

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
export function canViewTask(user, task) {
  if (!user?.isStaff) return false;
  if (idStr(task.assignee) === user.id || idStr(task.createdBy) === user.id) return true;
  if (canReviewTask(user, task) || canManageTask(user, task)) return true;
  return hasPermission(user, "projects.view") && inScope(user, task.department);
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
      task.status = NO_REVIEW_KINDS.includes(task.kind) ? "done" : "submitted";
      return null;
    case "cancel":
      if (!ACTIVE_STATUSES.includes(s)) return "invalid_transition";
      stopClock(task, now);
      endHold(task, now);
      task.status = "cancelled";
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
  const ids = [...new Set((Array.isArray(value) ? value : []).map(String))].filter((id) => /^[a-f\d]{24}$/i.test(id) && id !== idStr(taskId));
  if (!ids.length) return { ids: [] };
  if ((await Task.countDocuments({ _id: { $in: ids } })) !== ids.length) return { error: "invalid_dependency" };
  if (taskId && (await createsCycle(taskId, ids))) return { error: "dependency_cycle" };
  return { ids };
}

// After a task finishes, tell the people whose tasks were waiting only for it.
export async function notifyUnblocked(task, notify) {
  if (!DEPENDENCY_DONE.includes(task.status)) return;
  const waiting = await Task.find({ dependsOn: task._id, status: "todo" }).lean();
  for (const w of waiting) {
    if ((await openBlockers(w)).length) continue;
    const [enriched] = await enrichTasks([w]);
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
  const channels = [...new Set(users)].map((id) => userChannel(id));
  if (task.department) channels.push(departmentChannel(idStr(task.department)));
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
    ...new Set(tasks.flatMap((t) => [idStr(t.assignee), idStr(t.createdBy), idStr(t.reviewedBy)]).filter(Boolean)),
  ];
  const [projects, users] = await Promise.all([
    WorkProject.find({ _id: { $in: projectIds } }, { name: 1, code: 1, items: 1, stages: 1 }).lean(),
    User.find({ _id: { $in: userIds } }, { name: 1, email: 1, avatarUrl: 1 }).lean(),
  ]);
  const projectMap = Object.fromEntries(projects.map((p) => [p._id.toString(), p]));
  const userMap = Object.fromEntries(
    users.map((u) => [u._id.toString(), { id: u._id.toString(), name: u.name || u.email, avatarUrl: u.avatarUrl || "" }])
  );

  return tasks.map((t) => {
    const p = projectMap[idStr(t.project)];
    const item = p?.items.find((i) => idStr(i._id) === idStr(t.item));
    const stage = p?.stages.find((s) => s.key === t.stage);
    return {
      id: t._id.toString(),
      number: t.number,
      kind: t.kind,
      title: t.title,
      project: p ? { id: p._id.toString(), name: p.name, code: p.code } : null,
      item: item ? { id: item._id.toString(), name: item.name } : null,
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
      late: isLate(t),
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

// Highest revision already used in a board cell (for R-01, R-02...).
export async function nextRevisionFor(projectId, itemId, stage) {
  if (!projectId || !itemId || !stage) return 0;
  const last = await Task.findOne({ project: projectId, item: itemId, stage, kind: { $in: ["task", "revision"] } })
    .sort({ revision: -1 })
    .lean();
  return last ? last.revision + 1 : 0;
}

// Short plain label used in notifications ("GF-05-DININGROOM · CAD").
export function taskTitle(t) {
  if (t.title) return t.title;
  return [t.item?.name, t.stage?.name?.en, t.project?.code || t.project?.name?.en].filter(Boolean).join(" · ") || "—";
}
