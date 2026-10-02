import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { getTaskSettings } from "@/lib/settings";
import {
  applyTransition,
  canManageTask,
  canReviewTask,
  enrichTask,
  logActivity,
  notifyUnblocked,
  openBlockers,
  publishTaskChange,
  reviewersFor,
  taskTitle,
} from "@/lib/tasks";
import { nextNumber } from "@/models/Counter";
import Task from "@/models/Task";
import User from "@/models/User";

const ASSIGNEE_ACTIONS = ["start", "pause", "resume", "help", "submit", "cancel"];

// Body: { action, ...fields }
//   start | pause | resume | cancel
//   help    { helperId, note }                 → creates a help task for the colleague
//   submit  { deliveryLink, employeeNotes }    → to the head (or done for meetings)
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
  }

  const error = applyTransition(task, action, now);
  if (error) return fail(error, 409);
  await task.save();
  await logActivity(task._id, user, action, action === "help" ? String(body.note || "").slice(0, 1000) : "", {
    helperId: helper?._id?.toString(),
  });

  const enriched = await enrichTask(task);
  const notifyParams = { actor: actorName, number: task.number, title: taskTitle(enriched) };
  let extra = [];

  if (action === "help") {
    const helpTask = await Task.create({
      number: await nextNumber("task"),
      kind: "help",
      title: String(body.note || "").trim().slice(0, 200) || `#${task.number}`,
      project: task.project,
      item: task.item,
      stage: task.stage,
      department: task.department,
      type: task.type,
      assignee: helper._id,
      createdBy: user.id,
      priority: task.priority,
      previousTask: task._id,
      dueAt: task.dueAt,
    });
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
    const due = body.newDueAt ? new Date(body.newDueAt) : null;
    revisionTask = await Task.create({
      number: await nextNumber("task"),
      kind: task.project && task.item ? "revision" : task.kind,
      title: task.title,
      project: task.project,
      item: task.item,
      stage: task.stage,
      department: task.department,
      type: task.type,
      assignee: task.assignee,
      createdBy: user.id,
      priority: task.priority,
      revision: task.revision + 1,
      previousTask: task._id,
      dueAt: due && !Number.isNaN(due.getTime()) ? due : null,
      description: task.headNotes,
    });
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
  if (approve) await notifyUnblocked(task, notify);
  return NextResponse.json({ task: enriched, revisionTaskId: revisionTask?._id?.toString() || null });
}
