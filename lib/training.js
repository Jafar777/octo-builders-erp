import { pickName } from "@/lib/personName";
// The Training Program: trainees' own practice tasks, rated by the CEO. It is a
// separate place: nothing here touches projects, the Gantt, KPI, payroll or finance.

// The CEO (training.manage, set on the Roles page): see every trainee's work, give them
// tasks, rate it and mark people as trainees.
export function isTrainingAdmin(user) {
  return Boolean(user?.isStaff && !user.limited && user.permissions?.includes("training.manage"));
}

// Who may open the Training Program page: the CEO and the trainees.
export function canOpenTraining(user) {
  return isTrainingAdmin(user) || Boolean(user?.trainee && !user.limited);
}

const idStr = (v) => (v ? v.toString() : null);

export function serializeTrainingTask(task, people, lang) {
  const person = (id) => {
    const u = people[idStr(id)];
    return u ? { id: idStr(u._id), name: pickName(u, lang), avatarUrl: u.avatarUrl || "" } : null;
  };
  return {
    id: task._id.toString(),
    title: task.title,
    description: task.description || "",
    status: task.status,
    trainee: person(task.trainee),
    createdBy: person(task.createdBy),
    assignedByAdmin: Boolean(task.assignedByAdmin),
    finishedAt: task.finishedAt || null,
    rating: task.rating || null,
    ratedAt: task.ratedAt || null,
    createdAt: task.createdAt,
  };
}

// Top trainees of a month: total stars of the tasks they finished that month, then the
// average, then how many they finished. Only trainees with at least one rated task.
export function rankTrainees(finished) {
  const by = {};
  for (const t of finished) {
    if (!t.rating || !t.trainee) continue;
    const r = (by[t.trainee.id] ||= { trainee: t.trainee, stars: 0, rated: 0 });
    r.stars += t.rating;
    r.rated += 1;
  }
  const done = {};
  for (const t of finished) if (t.trainee) done[t.trainee.id] = (done[t.trainee.id] || 0) + 1;
  return Object.values(by)
    .map((r) => ({ ...r, finished: done[r.trainee.id] || 0, average: Math.round((r.stars / r.rated) * 10) / 10 }))
    .sort((a, b) => b.stars - a.stars || b.average - a.average || b.finished - a.finished)
    .slice(0, 3);
}
