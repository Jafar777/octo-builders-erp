import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { externalHours, readyTime, taskSpan } from "@/lib/gantt";
import { cascadeFrom, getWorkCalendar } from "@/lib/ganttServer";
import { notify } from "@/lib/notify";
import { trackDelays } from "@/lib/projectDelay";
import { canRouteStages } from "@/lib/projects";
import { inScope } from "@/lib/scope";
import { placeForAssignee } from "@/lib/taskSchedule";
import { canStartNow, enrichTask, logActivity, notifyReady, publishTaskChange } from "@/lib/tasks";
import Task from "@/models/Task";

const idStr = (v) => (v ? v.toString() : null);

// The external review of a task (another office checks the work after it's handed in;
// lib/gantt.js readyTime). Body:
//   { hours: n }            the CEO sets how long the review is planned to take (0 = none)
//   { action: "received" }  the review came back: the tasks waiting for it can start
//   { action: "reopen" }    marked received by mistake: still waiting
// The tasks after it move with it: later when the wait grows (or the review is late),
// earlier — into their employee's first free time — when it comes back early.
export async function POST(request, { params }) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const task = await Task.findById(id);
  if (!task) return notFound();
  const body = await readJson(request);

  const planner = canRouteStages(user);
  // Who hears back from the other office: the task's employee, its department's
  // managers, and the CEO.
  const canMark = planner || idStr(task.assignee) === user.id || (hasPermission(user, "tasks.review") && inScope(user, task.department));

  if (body.hours !== undefined) {
    if (!planner) return forbidden();
    const hours = Number(body.hours);
    if (!Number.isFinite(hours) || hours < 0 || hours > 2000) return fail("invalid_hours");
    task.externalReview = { ...(task.externalReview?.toObject?.() || {}), hours: Math.round(hours * 2) / 2 };
    await task.save();
    await logActivity(task._id, user, "edited", "", { fields: ["externalReview"] });
  } else if (body.action === "received" || body.action === "reopen") {
    if (!canMark) return forbidden();
    if (!externalHours(task)) return fail("no_external_review");
    if (body.action === "received") {
      if (task.externalReview.receivedAt) return fail("already_received", 409);
      if (!["submitted", "approved", "done"].includes(task.status)) return fail("not_delivered", 409);
      task.externalReview.receivedAt = new Date();
      task.externalReview.receivedBy = user.id;
    } else {
      task.externalReview.receivedAt = null;
      task.externalReview.receivedBy = null;
    }
    await task.save();
    await logActivity(task._id, user, body.action === "received" ? "external_received" : "external_reopened");
  } else {
    return fail("invalid_request");
  }
  await publishTaskChange(task);

  // Move what waits for it: later if needed…
  const cal = await getWorkCalendar();
  const moved = await cascadeFrom([task._id], cal, user);
  // …or earlier, into each employee's first free time, when the wait got shorter.
  const ready = readyTime(task.toObject(), cal);
  const waiting = await Task.find({ dependsOn: task._id, status: "todo", kind: { $ne: "meeting" } });
  for (const w of waiting) {
    const span = taskSpan(w);
    if (span.start <= ready + 60000) continue;
    const slot = await placeForAssignee(w, idStr(w.assignee), cal);
    if (slot.start < span.start - 60000) {
      w.plannedStart = new Date(slot.start);
      w.dueAt = new Date(slot.end);
      w.dueReminderSent = false;
      await w.save();
      await logActivity(w._id, user, "rescheduled", "", { pulled: true });
      await publishTaskChange(w);
    }
  }
  // Review back: the people whose tasks can start now are told.
  if (body.action === "received") {
    for (const w of waiting) if (await canStartNow(w)) await notifyReady(w, notify);
  }
  if (task.project && (moved.length || waiting.length)) await trackDelays({ cause: "external_review", task }, user);

  return NextResponse.json({ task: await enrichTask(task.toObject()) });
}
