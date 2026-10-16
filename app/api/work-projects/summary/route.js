import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { HOUR, makeCalendar, officeDate } from "@/lib/gantt";
import { pickName, viewerLang } from "@/lib/personName";
import { lateTaskCount, projectRisk, RISK_LEVELS } from "@/lib/projectHealth";
import { buildCells, projectQueryFor } from "@/lib/projects";
import { getSettings } from "@/lib/settings";
import { enrichTasks } from "@/lib/tasks";
import Task from "@/models/Task";
import User from "@/models/User";
import WorkProject from "@/models/WorkProject";

const idStr = (v) => (v ? v.toString() : null);
const OPEN = ["todo", "in_progress", "on_hold", "help"];
const ms = (d) => (d ? new Date(d).getTime() : null);

// Summary under the projects timeline: this month's task numbers, what needs
// attention now, project health and the month's top contributors. Covers the
// projects the viewer can list.
export async function GET() {
  const user = await requireStaff();
  if (!user) return forbidden();

  const [projects, settings] = await Promise.all([WorkProject.find(projectQueryFor(user)).lean(), getSettings()]);
  const cal = makeCalendar(settings);
  const now = Date.now();
  const month = officeDate(now, cal).slice(0, 7);
  const inMonth = (d) => Boolean(d) && officeDate(ms(d), cal).slice(0, 7) === month;

  const tasks = await Task.find(
    { project: { $in: projects.map((p) => p._id) }, status: { $ne: "cancelled" } },
    {
      number: 1, title: 1, project: 1, stage: 1, kind: 1, status: 1, assignee: 1, createdAt: 1, dueAt: 1,
      submittedAt: 1, reviewedAt: 1, activeMs: 1, maxHours: 1, stars: 1, revision: 1, dependsOn: 1, parentTask: 1,
    }
  ).lean();

  // ---------- tasks this month ----------
  const completedAt = (t) => (t.status === "approved" ? t.reviewedAt || t.submittedAt : t.status === "done" ? t.submittedAt : null);
  const completed = tasks.filter((t) => inMonth(completedAt(t)));
  const withDue = completed.filter((t) => t.dueAt && t.submittedAt);
  const onTime = withDue.filter((t) => ms(t.submittedAt) <= ms(t.dueAt)).length;
  const scaled = completed.filter((t) => t.maxHours > 0);
  const withinScale = scaled.filter((t) => (t.activeMs || 0) <= t.maxHours * HOUR).length;
  const rejected = tasks.filter((t) => t.status === "rejected" && inMonth(t.reviewedAt)).length;
  const reviewed = completed.filter((t) => t.status === "approved").length + rejected;
  const open = tasks.filter((t) => OPEN.includes(t.status));
  const overdue = open.filter((t) => t.dueAt && ms(t.dueAt) < now);
  const dueSoon = open.filter((t) => t.dueAt && ms(t.dueAt) >= now && ms(t.dueAt) < now + 7 * 24 * HOUR).length;

  const monthStats = {
    month,
    created: tasks.filter((t) => inMonth(t.createdAt)).length,
    completed: completed.length,
    onTimeRate: withDue.length ? Math.round((onTime / withDue.length) * 100) : null,
    withinScaleRate: scaled.length ? Math.round((withinScale / scaled.length) * 100) : null,
    rejected,
    rejectionRate: reviewed ? Math.round((rejected / reviewed) * 100) : null,
    hoursWorked: Math.round(completed.reduce((h, t) => h + (t.activeMs || 0), 0) / HOUR),
  };
  const nowStats = {
    open: open.length,
    inProgress: tasks.filter((t) => t.status === "in_progress").length,
    waitingReview: tasks.filter((t) => t.status === "submitted").length,
    onHold: tasks.filter((t) => ["on_hold", "help"].includes(t.status)).length,
    overdue: overdue.length,
    dueSoon,
  };

  // ---------- projects ----------
  const byProject = {};
  for (const t of tasks) (byProject[idStr(t.project)] ||= []).push(t);
  const live = projects.filter((p) => ["active", "on_hold"].includes(p.status));
  const health = live.map((p) => {
    const list = byProject[p._id.toString()] || [];
    const { progress } = buildCells(p, list);
    const risk = projectRisk(p, progress, lateTaskCount(list, now), list.filter((t) => t.status === "rejected").length, now);
    return {
      id: p._id.toString(),
      name: p.name,
      code: p.code,
      dueDate: p.dueDate,
      progress,
      late: ms(p.dueDate) < now,
      risk: risk.level,
      reason: risk.reason,
      openTasks: list.filter((t) => OPEN.includes(t.status)).length,
    };
  });
  const projectStats = {
    active: projects.filter((p) => p.status === "active").length,
    onHold: projects.filter((p) => p.status === "on_hold").length,
    late: health.filter((h) => h.late).length,
    atRisk: health.filter((h) => ["high", "critical"].includes(h.risk)).length,
    dueThisMonth: live.filter((p) => inMonth(p.dueDate)).length,
    finishedThisMonth: projects.filter((p) => inMonth(p.finishedAt)).length,
    avgProgress: health.length ? Math.round((health.reduce((a, h) => a + h.progress, 0) / health.length) * 100) : null,
  };
  const watch = health
    .sort((a, b) => Number(b.late) - Number(a.late) || RISK_LEVELS.indexOf(b.risk) - RISK_LEVELS.indexOf(a.risk) || ms(a.dueDate) - ms(b.dueDate))
    .slice(0, 6)
    .map((h) => ({ ...h, progress: Math.round(h.progress * 100) }));

  // ---------- people ----------
  const people = {};
  for (const t of completed) {
    const id = idStr(t.assignee);
    const row = (people[id] ||= { id, completed: 0, onTime: 0, withDue: 0, stars: 0, rated: 0 });
    row.completed += 1;
    if (t.dueAt && t.submittedAt) {
      row.withDue += 1;
      if (ms(t.submittedAt) <= ms(t.dueAt)) row.onTime += 1;
    }
    if (t.stars) {
      row.stars += t.stars;
      row.rated += 1;
    }
  }
  const topRows = Object.values(people)
    .sort((a, b) => b.completed - a.completed || b.stars / (b.rated || 1) - a.stars / (a.rated || 1))
    .slice(0, 5);
  const users = await User.find({ _id: { $in: topRows.map((r) => r.id) } }, { name: 1, nameAr: 1, email: 1, avatarUrl: 1 }).lean();
  const lang = await viewerLang();
  const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u]));
  const top = topRows.map((r) => ({
    id: r.id,
    name: userMap[r.id] ? pickName(userMap[r.id], lang) : "—",
    avatarUrl: userMap[r.id]?.avatarUrl || "",
    completed: r.completed,
    onTimeRate: r.withDue ? Math.round((r.onTime / r.withDue) * 100) : null,
    stars: r.rated ? Math.round((r.stars / r.rated) * 10) / 10 : null,
  }));

  // Most overdue open tasks.
  const overdueList = await enrichTasks(overdue.sort((a, b) => ms(a.dueAt) - ms(b.dueAt)).slice(0, 6));

  return NextResponse.json({ month: monthStats, now: nowStats, projects: projectStats, watch, top, overdue: overdueList });
}
