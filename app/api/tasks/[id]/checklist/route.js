import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { canManageTask, managesAssignee } from "@/lib/tasks";
import { publish, userChannel } from "@/lib/realtime/server";
import Task from "@/models/Task";

// The task's checklist: the employee working on it and whoever manages it.
// { add: text } | { toggle: id } | { remove: id } | { order: [ids] }
export async function PATCH(request, { params }) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const task = await Task.findById(id);
  if (!task) return notFound();
  const mine = task.assignee.toString() === user.id;
  if (!mine && !canManageTask(user, task) && !(await managesAssignee(user, task))) return forbidden();
  if (["cancelled"].includes(task.status)) return fail("invalid_request");
  const b = await readJson(request);
  if (typeof b.add === "string") {
    const text = b.add.trim().slice(0, 300);
    if (!text) return fail("title_required");
    if (task.checklist.length >= 50) return fail("invalid_request");
    task.checklist.push({ text });
  } else if (b.toggle && task.checklist.id(b.toggle)) {
    const c = task.checklist.id(b.toggle);
    c.done = !c.done;
    c.doneBy = c.done ? user.id : null;
    c.doneAt = c.done ? new Date() : null;
  } else if (b.remove && task.checklist.id(b.remove)) {
    task.checklist.id(b.remove).deleteOne();
  } else if (Array.isArray(b.order)) {
    const byId = Object.fromEntries(task.checklist.map((c) => [c._id.toString(), c]));
    const next = b.order.map((x) => byId[x]).filter(Boolean);
    if (next.length !== task.checklist.length) return fail("invalid_request");
    task.checklist = next;
  } else {
    return fail("invalid_request");
  }
  await task.save();
  await publish([userChannel(task.assignee.toString())], "task:updated", { id });
  return NextResponse.json({ checklist: task.checklist.map((c) => ({ id: c._id.toString(), text: c.text, done: c.done, doneAt: c.doneAt })) });
}
