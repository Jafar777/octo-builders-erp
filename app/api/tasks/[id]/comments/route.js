import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { notify } from "@/lib/notify";
import { canViewTask, logActivity, publishTaskChange, reviewersFor } from "@/lib/tasks";
import Task from "@/models/Task";

export async function POST(request, { params }) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const task = await Task.findById(id);
  if (!task) return notFound();
  if (!canViewTask(user, task)) return forbidden();

  const text = String((await readJson(request)).text || "").trim().slice(0, 2000);
  if (!text) return fail("empty_message");

  await logActivity(task._id, user, "comment", text);

  // The assignee hears about comments from others; the others hear about the assignee's.
  const recipients =
    task.assignee.toString() === user.id
      ? [task.createdBy.toString(), ...(task.status === "submitted" ? await reviewersFor(task) : [])]
      : [task.assignee.toString()];
  await notify({
    type: "task.comment",
    recipients,
    actor: user,
    params: { actor: user.name || user.email, number: task.number },
    link: `/dashboard/tasks?task=${task._id}`,
    entityType: "task",
    entityId: task._id,
  });
  await publishTaskChange(task);

  return NextResponse.json({ ok: true }, { status: 201 });
}
