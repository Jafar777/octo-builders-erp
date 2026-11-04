import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/currentUser";
import { forbidden, isObjectId } from "@/lib/apiUtils";
import { NAME_FIELDS, pickName, viewerLang } from "@/lib/personName";
import { enrichTasks } from "@/lib/tasks";
import { customerTask, isTopReviewer, queueQuery, reviewerRoles } from "@/lib/taskReview";
import Department from "@/models/Department";
import Task from "@/models/Task";
import User from "@/models/User";
import { userDepartments } from "@/lib/scope";

const idStr = (v) => (v ? v.toString() : null);
const LIMIT = 500;
const DAY = 24 * 3600 * 1000;

// The Reviews page.
//   ?tab=queue       work waiting for my review (my level)
//   ?tab=mine        reviews I gave
//   ?tab=managers    reviews the department managers gave, with a summary per manager (GM / CEO)
//   ?tab=employees   reviews each employee's work got, with a summary per employee
//                    (GM / CEO: everyone; a department manager: their department)
//   &person=<id>     one manager / employee      &month=YYYY-MM   (default: the last 6 months)
// Customers only get `queue` and `mine`, and only what concerns their own reviews.
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user || !(user.isCustomer || (user.isStaff && hasPermission(user, "tasks.review")))) return forbidden();
  const params = new URL(request.url).searchParams;
  const tab = params.get("tab") || "queue";
  const top = isTopReviewer(user);
  const customer = !user.isStaff;
  const person = isObjectId(params.get("person")) ? params.get("person") : null;
  const tabs = customer ? ["queue", "mine"] : top ? ["queue", "mine", "managers", "employees"] : ["queue", "mine", "employees"];
  if (!tabs.includes(tab)) return forbidden();

  const shape = async (list) => {
    const enriched = await enrichTasks(list);
    return customer ? enriched.map(customerTask) : enriched;
  };

  if (tab === "queue") {
    const query = await queueQuery(user);
    const list = query ? await Task.find(query).sort({ submittedAt: 1 }).limit(LIMIT).lean() : [];
    return NextResponse.json({ tabs, tasks: await shape(list) });
  }

  // History tabs: reviews given in the chosen month, or the last 6 months.
  const month = /^\d{4}-\d{2}$/.test(params.get("month") || "") ? params.get("month") : null;
  const from = month ? new Date(`${month}-01T00:00:00Z`) : new Date(Date.now() - 183 * DAY);
  const to = month ? new Date(new Date(from).setUTCMonth(from.getUTCMonth() + 1)) : new Date(Date.now() + DAY);
  const inRange = (at) => at && new Date(at) >= from && new Date(at) < to;

  // Reviews given before levels existed (no `reviews` list): the single review on the task.
  const reviewsOf = (t) =>
    t.reviews?.length
      ? t.reviews
      : t.reviewedBy && ["approved", "rejected"].includes(t.status)
        ? [{ level: "", by: t.reviewedBy, at: t.reviewedAt, decision: t.status === "approved" ? "approve" : "reject", stars: t.stars, ratings: t.ratings, notes: t.headNotes, rejectCause: t.rejectCause, onBehalf: false }]
        : [];

  let query;
  let keep; // which reviews of a task to list
  let managers = [];
  if (tab === "mine") {
    query = { $or: [{ "reviews.by": user.id }, { reviewedBy: user.id }] };
    keep = (r) => idStr(r.by) === user.id;
  } else if (tab === "managers") {
    const roles = await reviewerRoles("department");
    managers = await User.find({ role: { $in: roles }, status: "active" }, { ...NAME_FIELDS, department: 1, avatarUrl: 1 }).lean();
    const ids = (person ? managers.filter((m) => idStr(m._id) === person) : managers).map((m) => m._id);
    query = { $or: [{ "reviews.by": { $in: ids } }, { reviewedBy: { $in: ids } }] };
    const set = new Set(ids.map(idStr));
    keep = (r) => set.has(idStr(r.by)) && !r.onBehalf;
  } else {
    // employees
    query = { $or: [{ "reviews.0": { $exists: true } }, { reviewedBy: { $ne: null } }] };
    if (!top) query.department = { $in: userDepartments(user) };
    if (person) query.assignee = person;
    keep = () => true;
  }
  query.$and = [{ $or: [{ "reviews.at": { $gte: from, $lt: to } }, { reviewedAt: { $gte: from, $lt: to } }] }];

  const list = await Task.find(query).sort({ updatedAt: -1 }).limit(LIMIT).lean();
  const tasks = await shape(list);
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
  const lang = await viewerLang();
  const people = await User.find({ _id: { $in: [...new Set(list.flatMap((t) => reviewsOf(t).map((r) => idStr(r.by))))] } }, { ...NAME_FIELDS, avatarUrl: 1 }).lean();
  const nameOf = Object.fromEntries(people.map((p) => [idStr(p._id), { id: idStr(p._id), name: pickName(p, lang), avatarUrl: p.avatarUrl || "" }]));

  const entries = [];
  for (const t of list) {
    for (const r of reviewsOf(t)) {
      if (!keep(r) || !inRange(r.at)) continue;
      entries.push({
        key: `${idStr(t._id)}-${new Date(r.at).getTime()}-${idStr(r.by)}`,
        task: byId[idStr(t._id)],
        review: {
          level: r.level,
          by: nameOf[idStr(r.by)] || null,
          at: r.at,
          decision: r.decision,
          stars: r.stars || 0,
          // The team's own rating tags and notes stay inside the team.
          ratings: customer ? [] : r.ratings || [],
          notes: r.notes || "",
          rejectCause: r.rejectCause || "",
          onBehalf: Boolean(r.onBehalf),
        },
      });
    }
  }
  entries.sort((a, b) => new Date(b.review.at) - new Date(a.review.at));

  // Summaries: per manager (reviews they gave, work waiting for them) or per employee.
  let summary = [];
  if (tab === "managers") {
    const departments = Object.fromEntries((await Department.find({}, { name: 1 }).lean()).map((d) => [idStr(d._id), d.name]));
    const waiting = await Task.aggregate([{ $match: { status: "submitted", reviewLevel: { $in: ["manager", "", null] } } }, { $group: { _id: "$department", n: { $sum: 1 } } }]);
    const waitingBy = Object.fromEntries(waiting.map((w) => [idStr(w._id), w.n]));
    summary = managers.map((m) => {
      const mine = entries.filter((e) => e.review.by?.id === idStr(m._id));
      const rated = mine.filter((e) => e.review.stars > 0);
      return {
        id: idStr(m._id),
        name: pickName(m, lang),
        avatarUrl: m.avatarUrl || "",
        department: departments[idStr(m.department)] || null,
        reviews: mine.length,
        approved: mine.filter((e) => e.review.decision === "approve").length,
        rejected: mine.filter((e) => e.review.decision === "reject").length,
        stars: rated.length ? Math.round((rated.reduce((n, e) => n + e.review.stars, 0) / rated.length) * 10) / 10 : null,
        waiting: waitingBy[idStr(m.department)] || 0,
      };
    });
  } else if (tab === "employees") {
    const by = {};
    for (const e of entries) {
      const a = e.task?.assignee;
      if (!a) continue;
      const row = (by[a.id] ||= { id: a.id, name: a.name, avatarUrl: a.avatarUrl, reviews: 0, approved: 0, rejected: 0, starSum: 0, rated: 0, customer: 0 });
      row.reviews += 1;
      if (e.review.decision === "approve") row.approved += 1;
      else row.rejected += 1;
      if (e.review.level === "customer" && !e.review.onBehalf) row.customer += 1;
      if (e.review.stars > 0) {
        row.starSum += e.review.stars;
        row.rated += 1;
      }
    }
    summary = Object.values(by)
      .map(({ starSum, rated, ...r }) => ({ ...r, stars: rated ? Math.round((starSum / rated) * 10) / 10 : null }))
      .sort((a, b) => b.reviews - a.reviews);
  }

  return NextResponse.json({ tabs, entries, summary });
}
