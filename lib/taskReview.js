// Reviewing handed-in work, level by level (see lib/reviewFlow): who may review a task
// now, whom to tell, each reviewer's queue, and the decision itself.

import { hasPermission } from "@/lib/currentUser";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { cascadeFrom, getWorkCalendar } from "@/lib/ganttServer";
import { HOUR, taskSpan, workMsBetween } from "@/lib/gantt";
import { checkStageHandoffs } from "@/lib/projects";
import { trackDelays } from "@/lib/projectDelay";
import { INTERNAL_LEVELS, pendingLevel } from "@/lib/reviewFlow";
import { getTaskSettings } from "@/lib/settings";
import { insertRedo } from "@/lib/taskSchedule";
import { enrichTask, logActivity, notifyPredecessorRejected, publishTaskChange, taskTitle } from "@/lib/tasks";
import { nextNumber } from "@/models/Counter";
import Department from "@/models/Department";
import Role from "@/models/Role";
import Task from "@/models/Task";
import User from "@/models/User";
import WorkProject from "@/models/WorkProject";

const idStr = (v) => (v ? v.toString() : null);
// Older tasks have no level: they wait for the department manager.
const MANAGER_LEVEL = { $in: ["manager", "", null] };

// The GM / CEO: reviewers whose role sees the whole company.
export const isTopReviewer = (user) => Boolean(user?.isStaff && user.scope === "all" && hasPermission(user, "tasks.review"));
const isDepartmentReviewer = (user, departmentId) =>
  Boolean(user?.isStaff && user.scope === "department" && hasPermission(user, "tasks.review") && user.department && user.department === idStr(departmentId));

export async function reviewerRoles(scope) {
  return (await Role.find({ permissions: "tasks.review", scope }, { key: 1 }).lean()).map((r) => r.key);
}

async function topReviewers() {
  const roles = await reviewerRoles("all");
  return (await User.find({ status: "active", role: { $in: roles } }, { _id: 1 }).lean()).map((u) => idStr(u._id));
}

async function departmentReviewers(departmentId) {
  if (!departmentId) return [];
  const roles = await reviewerRoles("department");
  return (await User.find({ status: "active", department: departmentId, role: { $in: roles } }, { _id: 1 }).lean()).map((u) => idStr(u._id));
}

async function customerOf(task) {
  if (!task.project) return null;
  return idStr((await WorkProject.findById(task.project, { customer: 1 }).lean())?.customer);
}

// Who reviews `task` at `level`. A level nobody holds (a department without a manager,
// a project without a customer) falls to the GM / CEO.
export async function reviewersAt(task, level) {
  let ids = [];
  if (level === "customer") ids = [await customerOf(task)].filter(Boolean);
  else if (level === "manager") ids = await departmentReviewers(task.department);
  if (!ids.length || level === "gm") ids = await topReviewers();
  return ids.filter((id) => id !== idStr(task.assignee));
}

// Can `user` review `task` right now? Returns { level, covers, onBehalf } or null.
export async function reviewAccess(user, task) {
  if (!user || task.status !== "submitted" || idStr(task.assignee) === user.id) return null;
  const level = pendingLevel(task);
  if (!level) return null;
  const top = isTopReviewer(user);
  if (level === "customer") {
    if ((await customerOf(task)) === user.id) return { level, covers: ["customer"], onBehalf: false };
    return top ? { level, covers: ["customer"], onBehalf: true } : null;
  }
  // The GM / CEO's review counts for both internal levels.
  if (top) return { level, covers: INTERNAL_LEVELS, onBehalf: false };
  if (level === "manager" && isDepartmentReviewer(user, task.department)) return { level, covers: ["manager"], onBehalf: false };
  return null;
}

// Mongo filter of the handed-in tasks waiting for `user`'s review, or null.
export async function queueQuery(user) {
  if (!user) return null;
  if (!user.isStaff) {
    const projects = await WorkProject.find({ customer: user.id }, { _id: 1 }).lean();
    if (!projects.length) return null;
    return { status: "submitted", reviewLevel: "customer", project: { $in: projects.map((p) => p._id) } };
  }
  if (!hasPermission(user, "tasks.review")) return null;
  const notMine = { status: "submitted", assignee: { $ne: user.id } };
  if (!isTopReviewer(user)) {
    if (user.scope !== "department" || !user.department) return null;
    return { ...notMine, reviewLevel: MANAGER_LEVEL, department: user.department };
  }
  // The GM / CEO: their own level, plus levels nobody else holds.
  const roles = await reviewerRoles("department");
  const managed = await User.distinct("department", { status: "active", role: { $in: roles }, department: { $ne: null } });
  const unmanaged = await Department.distinct("_id", { _id: { $nin: managed } });
  const noCustomer = await WorkProject.distinct("_id", { customer: null });
  return {
    ...notMine,
    $or: [
      { reviewLevel: "gm" },
      { reviewLevel: MANAGER_LEVEL, department: { $in: [...unmanaged, null] } },
      { reviewLevel: "customer", $or: [{ project: { $in: noCustomer } }, { project: null }] },
    ],
  };
}

async function tellReviewers(task, level, actor) {
  const enriched = await enrichTask(task);
  const recipients = await reviewersAt(task, level);
  await notify({
    type: level === "customer" ? "task.customer_review" : "task.submitted",
    recipients,
    actor,
    params: { actor: actor?.name || actor?.email || "", number: task.number, title: taskTitle(enriched) },
    link: `/dashboard/reviews?task=${task._id}`,
    entityType: "task",
    entityId: task._id,
  });
  return recipients;
}

// Handed in: the first review level starts. Returns the people told.
export async function startReview(task, actor) {
  task.reviews = [];
  task.reviewLevel = pendingLevel(task) || "manager";
  await task.save();
  return tellReviewers(task, task.reviewLevel, actor);
}

const roundStars = (list) => (list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : 0);

// A review decision. body = { decision: approve|reject, stars, ratings[], notes,
// rejectCause, redoHours }. Returns { error, status } or { task, revisionTaskId, done }.
export async function reviewTask(user, task, body, now = new Date()) {
  const access = await reviewAccess(user, task);
  if (!access) return { error: task.status === "submitted" ? "forbidden" : "not_submitted", status: task.status === "submitted" ? 403 : 409 };
  if (!["approve", "reject"].includes(body.decision)) return { error: "invalid_request", status: 400 };
  const approve = body.decision === "approve";
  const customer = access.level === "customer" && !access.onBehalf;

  // Every approval carries 1–5 stars; on a rejection they're optional.
  const stars = Math.round(Number(body.stars));
  const validStars = stars >= 1 && stars <= 5;
  if (approve && !validStars) return { error: "stars_required", status: 400 };
  // Rating tags are the team's own (KPIs): the customer gives stars and notes.
  const settings = await getTaskSettings();
  const validTags = new Set(settings.ratingTags.map((r) => r.key));
  const ratings = customer ? [] : [...new Set((Array.isArray(body.ratings) ? body.ratings : []).filter((r) => validTags.has(r)))];
  const notes = String(body.notes || "").slice(0, 2000);
  // The GM / CEO may give the redo its working hours (default: the original task's).
  const planner = user.isStaff && user.scope === "all" && hasPermission(user, "projects.manage");
  let redoHours = null;
  if (!approve && planner && body.redoHours != null && body.redoHours !== "") {
    redoHours = Math.round(Number(body.redoHours) * 2) / 2;
    if (!(redoHours >= 0.5 && redoHours <= 200)) return { error: "invalid_task_hours", status: 400 };
  }
  const rejectCause = approve ? "" : customer || access.level === "customer" ? "customer" : ["employee", "management", "project"].includes(body.rejectCause) ? body.rejectCause : "employee";

  task.reviews.push({ level: access.level, covers: access.covers, by: user.id, at: now, decision: body.decision, stars: validStars ? stars : 0, ratings, notes, rejectCause, onBehalf: access.onBehalf });
  const next = approve ? pendingLevel(task) : null;
  const enriched = await enrichTask(task);
  const title = taskTitle(enriched);

  // Approved at this level, another level still to review.
  if (next) {
    task.reviewLevel = next;
    await task.save();
    await logActivity(task._id, user, "review_passed", notes, { level: access.level, stars: validStars ? stars : 0, next });
    const told = await tellReviewers(task, next, user);
    await notify({
      type: "task.review_passed",
      recipients: [idStr(task.assignee)],
      actor: user,
      params: { number: task.number, title, level: access.level, next },
      link: `/dashboard/tasks?task=${task._id}`,
      entityType: "task",
      entityId: task._id,
    });
    await publishTaskChange(task, [user.id, ...told]);
    return { task: await enrichTask(task), revisionTaskId: null, done: false };
  }

  // The final decision: the task's summary follows it.
  const approvals = task.reviews.filter((r) => r.decision === "approve");
  task.status = approve ? "approved" : "rejected";
  task.reviewLevel = "";
  task.reviewedBy = user.id;
  task.reviewedAt = now;
  task.stars = approve ? roundStars(approvals.map((r) => r.stars).filter((s) => s > 0)) : validStars ? stars : 0;
  task.ratings = approve ? [...new Set(approvals.flatMap((r) => r.ratings || []))] : ratings;
  task.headNotes = approve ? approvals.map((r) => r.notes).filter(Boolean).join("\n\n") : notes;
  task.rejectCause = rejectCause;
  await task.save();
  await logActivity(task._id, user, approve ? "approved" : "rejected", notes, { ratings, stars: task.stars, rejectCause, level: access.level });
  await audit(user, approve ? "task.approved" : "task.rejected", { entityType: "task", entityId: task._id, summary: `#${task.number}` });

  let revisionTask = null;
  if (approve) {
    await notify({
      type: "task.approved",
      recipients: [idStr(task.assignee)],
      actor: user,
      params: { number: task.number, title },
      link: `/dashboard/tasks?task=${task._id}`,
      entityType: "task",
      entityId: task._id,
    });
  } else {
    // Rejection opens the next revision for the same person — the Excel "طلبات التعديلات".
    // The redo gets the same reviewers as the original and its hours (the GM / CEO may
    // give it other hours), and goes straight into the employee's schedule, pushing
    // their other planned tasks later. Its due time follows from the hours.
    const cal = await getWorkCalendar();
    const span = taskSpan(task);
    const hours = redoHours || task.maxHours || task.estimatedHours || Math.max(0.5, Math.round((workMsBetween(span.start, span.end, cal) / HOUR) * 2) / 2);
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
      revisionCause: rejectCause,
      previousTask: task._id,
      maxHours: hours,
      estimatedHours: hours,
      dueManual: true,
      description: notes,
      review: { manager: task.review?.manager ?? true, gm: Boolean(task.review?.gm), customer: Boolean(task.review?.customer) },
    });
    // Moves of the team's plan are the system's when a customer rejects, not the customer's.
    const planActor = user.isStaff ? user : null;
    await insertRedo(revisionTask, hours, cal, planActor);
    // Tasks waiting for the rejected task now wait for its redo (and move after it).
    await Task.updateMany({ dependsOn: task._id }, { $set: { "dependsOn.$": revisionTask._id } });
    await cascadeFrom([revisionTask._id], cal, planActor);
    await notifyPredecessorRejected(task, revisionTask, notify);
    await logActivity(revisionTask._id, user, "created", notes, { revisionOf: task.number });
    await notify({
      type: customer ? "task.customer_rejected" : "task.rejected",
      recipients: [idStr(task.assignee)],
      actor: user,
      params: { number: task.number, title, revision: String(revisionTask.revision).padStart(2, "0") },
      link: `/dashboard/tasks?task=${revisionTask._id}`,
      entityType: "task",
      entityId: revisionTask._id,
    });
    // The team hears when the customer turns work down.
    if (customer) {
      await notify({
        type: "task.customer_rejected",
        recipients: (await topReviewers()).filter((id) => id !== idStr(task.assignee)),
        actor: user,
        params: { number: task.number, title, revision: String(revisionTask.revision).padStart(2, "0") },
        link: `/dashboard/tasks?task=${revisionTask._id}`,
        entityType: "task",
        entityId: revisionTask._id,
      });
    }
    await publishTaskChange(revisionTask);
  }

  await publishTaskChange(task, [user.id]);
  // The next tasks and stages were released when the work was handed in. A rejection
  // locks the stages after it again until the redo is handed in.
  if (task.project && task.stage) await checkStageHandoffs(task.project, user.isStaff ? user : null);
  await trackDelays({ cause: approve ? "approved" : "rejected", task, note: approve ? "" : notes }, user.isStaff ? user : null);
  return { task: await enrichTask(task), revisionTaskId: revisionTask ? idStr(revisionTask._id) : null, done: true };
}

// What a customer sees of a task: the work to review, not the team's internal data
// (ratings, the team's reviews, hours, KPIs).
export function customerTask(t) {
  return {
    id: t.id,
    number: t.number,
    kind: t.kind,
    title: t.title,
    revision: t.revision,
    project: t.project,
    stage: t.stage,
    status: t.status,
    reviewLevel: t.reviewLevel,
    assignee: t.assignee ? { id: t.assignee.id, name: t.assignee.name, avatarUrl: t.assignee.avatarUrl } : null,
    submittedAt: t.submittedAt,
    deliveryLink: t.deliveryLink,
    attachments: t.attachments,
    employeeNotes: t.employeeNotes,
  };
}
