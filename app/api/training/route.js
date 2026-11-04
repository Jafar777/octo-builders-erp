import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { todayIn } from "@/lib/hr";
import { notify } from "@/lib/notify";
import { pickName, viewerLang } from "@/lib/personName";
import { getSettings } from "@/lib/settings";
import { canOpenTraining, isTrainingAdmin, rankTrainees, serializeTrainingTask } from "@/lib/training";
import TrainingTask from "@/models/TrainingTask";
import User from "@/models/User";

const MONTH = /^\d{4}-\d{2}$/;
const PERSON = { name: 1, nameAr: 1, email: 1, avatarUrl: 1 };

// The Training Program page. ?month=YYYY-MM picks the finished tasks and the ranking.
// GM / CEO: every trainee's tasks. A trainee: their own tasks (and the top 3).
export async function GET(request) {
  const user = await getCurrentUser();
  if (!canOpenTraining(user)) return forbidden();
  const admin = isTrainingAdmin(user);

  const settings = await getSettings();
  const param = new URL(request.url).searchParams.get("month");
  const month = MONTH.test(param || "") ? param : todayIn(settings.hr.timezone).slice(0, 7);

  const mine = admin ? {} : { trainee: user.id };
  const [ongoing, finished, monthFinished, trainees] = await Promise.all([
    TrainingTask.find({ ...mine, status: "ongoing" }).sort({ createdAt: -1 }).limit(500).lean(),
    TrainingTask.find({ ...mine, status: "finished", month }).sort({ finishedAt: -1 }).limit(500).lean(),
    // Everyone's finished tasks of the month, for the ranking.
    TrainingTask.find({ status: "finished", month }, { trainee: 1, rating: 1 }).lean(),
    admin ? User.find({ trainee: true, status: "active" }, PERSON).lean() : [],
  ]);

  const ids = [...ongoing, ...finished, ...monthFinished].flatMap((t) => [t.trainee, t.createdBy]).filter(Boolean);
  const people = Object.fromEntries((await User.find({ _id: { $in: ids } }, PERSON).lean()).map((u) => [u._id.toString(), u]));
  const lang = await viewerLang();
  const ser = (t) => serializeTrainingTask(t, people, lang);

  return NextResponse.json({
    month,
    admin,
    ongoing: ongoing.map(ser),
    finished: finished.map(ser),
    top: rankTrainees(monthFinished.map(ser)),
    trainees: trainees
      .map((u) => ({ id: u._id.toString(), name: pickName(u, lang), avatarUrl: u.avatarUrl || "" }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  });
}

// A new task: a trainee for themselves, or the GM / CEO for a trainee.
// { title, description?, trainee? (GM / CEO) }
export async function POST(request) {
  const user = await getCurrentUser();
  if (!canOpenTraining(user)) return forbidden();
  const admin = isTrainingAdmin(user);
  const body = await readJson(request);

  const title = String(body.title || "").trim().slice(0, 200);
  if (!title) return fail("title_required");
  const description = String(body.description || "").trim().slice(0, 4000);

  let trainee = user.id;
  if (admin) {
    if (!isObjectId(body.trainee) || !(await User.exists({ _id: body.trainee, trainee: true, status: "active" }))) return fail("invalid_trainee");
    trainee = body.trainee;
  }

  const task = await TrainingTask.create({ trainee, title, description, createdBy: user.id, assignedByAdmin: admin });
  if (admin) {
    await notify({
      type: "training.assigned",
      recipients: [trainee],
      actor: user,
      params: { actor: user.name || user.email, title },
      link: "/dashboard/training",
    });
  }
  return NextResponse.json({ id: task._id.toString() }, { status: 201 });
}
