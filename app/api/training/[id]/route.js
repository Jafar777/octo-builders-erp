import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { todayIn } from "@/lib/hr";
import { notify } from "@/lib/notify";
import { getSettings } from "@/lib/settings";
import { canOpenTraining, isTrainingAdmin } from "@/lib/training";
import TrainingTask from "@/models/TrainingTask";
import User from "@/models/User";

async function load(params) {
  const user = await getCurrentUser();
  if (!canOpenTraining(user)) return { error: forbidden() };
  const { id } = await params;
  if (!isObjectId(id)) return { error: notFound() };
  const task = await TrainingTask.findById(id);
  if (!task) return { error: notFound() };
  const admin = isTrainingAdmin(user);
  // A trainee only ever touches their own tasks.
  if (!admin && task.trainee.toString() !== user.id) return { error: forbidden() };
  return { user, task, admin };
}

// { action: "finish" }            the trainee (or GM / CEO) finishes it
// { action: "reopen" }            back to ongoing, while it isn't rated yet
// { action: "rate", rating: 1–5 } GM / CEO, finished tasks only
// { title?, description? }        edit, while it's ongoing
export async function PATCH(request, { params }) {
  const { user, task, admin, error } = await load(params);
  if (error) return error;
  const body = await readJson(request);

  if (body.action === "finish") {
    if (task.status !== "ongoing") return fail("training_not_ongoing", 409);
    const settings = await getSettings();
    task.status = "finished";
    task.finishedAt = new Date();
    task.month = todayIn(settings.hr.timezone).slice(0, 7);
    await task.save();
    if (!admin) {
      // The CEO is told (not the hidden coder).
      const admins = await User.find({ role: "ceo", status: "active" }, { _id: 1 }).lean();
      await notify({
        type: "training.finished",
        recipients: admins.map((a) => a._id.toString()),
        actor: user,
        params: { actor: user.name || user.email, title: task.title },
        link: "/dashboard/training",
      });
    }
  } else if (body.action === "reopen") {
    if (task.status !== "finished") return fail("training_not_finished", 409);
    if (task.rating) return fail("training_rated", 409);
    task.set({ status: "ongoing", finishedAt: null, month: "" });
    await task.save();
  } else if (body.action === "rate") {
    if (!admin) return forbidden();
    if (task.status !== "finished") return fail("training_not_finished", 409);
    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return fail("invalid_rating");
    task.set({ rating, ratedBy: user.id, ratedAt: new Date() });
    await task.save();
    await notify({
      type: "training.rated",
      recipients: [task.trainee.toString()],
      actor: user,
      params: { actor: user.name || user.email, title: task.title, stars: rating },
      link: "/dashboard/training",
    });
  } else {
    if (task.status !== "ongoing") return fail("training_not_ongoing", 409);
    if ("title" in body) {
      const title = String(body.title || "").trim().slice(0, 200);
      if (!title) return fail("title_required");
      task.title = title;
    }
    if ("description" in body) task.description = String(body.description || "").trim().slice(0, 4000);
    await task.save();
  }
  return NextResponse.json({ ok: true });
}

// GM / CEO: any task. A trainee: their own tasks that the GM / CEO didn't give them
// and haven't rated (a rating counts in the monthly ranking).
export async function DELETE(request, { params }) {
  const { task, admin, error } = await load(params);
  if (error) return error;
  if (!admin && (task.assignedByAdmin || task.rating)) return forbidden();
  await task.deleteOne();
  return NextResponse.json({ ok: true });
}
