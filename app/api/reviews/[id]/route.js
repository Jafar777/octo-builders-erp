import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { customerTask, reviewTask } from "@/lib/taskReview";
import Task from "@/models/Task";

// A review from the Reviews page, for anyone whose level the task waits for — customers
// included (they have no access to the task screens).
// Body: { decision: approve|reject, stars, ratings[], notes, rejectCause, redoHours }
export async function POST(request, { params }) {
  const user = await getCurrentUser();
  if (!user || user.limited || !(user.isStaff || user.isCustomer)) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const task = await Task.findById(id);
  if (!task) return notFound();
  const res = await reviewTask(user, task, await readJson(request));
  if (res.error) return fail(res.error, res.status);
  return NextResponse.json({ task: user.isStaff ? res.task : customerTask(res.task), done: res.done });
}
