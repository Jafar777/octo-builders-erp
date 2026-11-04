import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { projectEvm } from "@/lib/evm";
import { hourlyRates } from "@/lib/costRates";
import { forbidden } from "@/lib/apiUtils";
import { canEditGantt, canSeeGantt, HOLDING_STATUSES, isGanttDeptManager, makeCalendar } from "@/lib/gantt";
import { freeTime, serializeMilestone } from "@/lib/ganttServer";
import { markOverrunsSoon } from "@/lib/projectDelay";
import { pickName, viewerLang } from "@/lib/personName";
import { canRouteStages, projectQueryFor } from "@/lib/projects";
import { getSettings } from "@/lib/settings";
import { enrichTasks } from "@/lib/tasks";
import Task from "@/models/Task";
import User from "@/models/User";
import WorkProject from "@/models/WorkProject";
import { inDepartments } from "@/lib/scope";

const STATUSES = ["active", "on_hold", "finished", "archived"];
const idStr = (v) => (v ? v.toString() : null);

// Gantt data: every task of the projects I can list, the working calendar, each
// assignee's daily capacity, and the projects' milestones.
// ?status=active   (project status, default active)
export async function GET(request) {
  const user = await requireStaff();
  if (!canSeeGantt(user)) return forbidden();

  // Work running late pushes the plan before it's shown.
  await markOverrunsSoon();
  const status = new URL(request.url).searchParams.get("status");
  const query = { ...projectQueryFor(user) };
  if (STATUSES.includes(status)) query.status = status;

  const [projects, settings] = await Promise.all([
    WorkProject.find(query, { milestones: 1, taskBaselineAt: 1, baselines: 1, forecastStart: 1, forecastEnd: 1, rank: 1 }).lean(),
    getSettings(),
  ]);
  // A department manager sees (read-only) the work of their own department's employees.
  const departmentOnly = isGanttDeptManager(user);
  const taskQuery = { project: { $in: projects.map((p) => p._id) } };
  if (departmentOnly) {
    const team = user.department ? await User.find(inDepartments(user), { _id: 1 }).lean() : [];
    // ...and their departments' work given to employees of other departments.
    taskQuery.$or = [{ assignee: { $in: [user.id, ...team.map((u) => u._id.toString())] } }, inDepartments(user)];
  }
  // Cancelled tasks stay on the chart, greyed out (like inactive tasks in MS Project).
  const tasks = await Task.find(taskQuery)
    .sort({ plannedStart: 1, createdAt: 1 })
    .limit(3000)
    .lean();

  const assigneeIds = [...new Set(tasks.map((t) => idStr(t.assignee)))];
  // The same employees' other work that isn't on this chart (tasks without a project,
  // meetings, tasks of projects in another status): it still takes their time, so the
  // chart shows it and a bar can't be dropped on it.
  const busy = await Task.find({
    assignee: { $in: assigneeIds.filter(Boolean) },
    status: { $in: HOLDING_STATUSES },
    plannedStart: { $ne: null },
    dueAt: { $ne: null },
    _id: { $nin: tasks.map((t) => t._id) },
  })
    .limit(3000)
    .lean();
  const people = await User.find({ _id: { $in: assigneeIds } }, { name: 1, nameAr: 1, email: 1, avatarUrl: 1, workSchedule: 1 }).lean();
  const lang = await viewerLang();
  const calendar = makeCalendar(settings);
  const canSchedule = canEditGantt(user);
  // Milestone billing is set by whoever issues invoices.
  const canBill = canSchedule && hasPermission(user, "invoices.manage");
  // Earned value per project (hours; and money for finance viewers on the full chart).
  const withMoney = hasPermission(user, "finance.view") && !departmentOnly;
  const rates = withMoney ? await hourlyRates(assigneeIds.filter(Boolean), settings) : null;
  const tasksOf = {};
  for (const tk of tasks) (tasksOf[String(tk.project)] ||= []).push(tk);
  const nowMs = Date.now();

  return NextResponse.json({
    tasks: await enrichTasks(tasks),
    busy: await enrichTasks(busy),
    calendar,
    people: people.map((p) => ({
      id: p._id.toString(),
      name: pickName(p, lang),
      avatarUrl: p.avatarUrl || "",
      // A personal daily-hours setting; null = the company's hours of each day.
      dailyHours: p.workSchedule?.custom && Number.isFinite(p.workSchedule.dailyHours) ? p.workSchedule.dailyHours : null,
    })),
    projects: projects.map((p) => ({
      id: p._id.toString(),
      milestones: (p.milestones || []).map(serializeMilestone),
      taskBaselineAt: p.taskBaselineAt,
      baselines: (p.baselines || []).map((b) => ({ n: b.n, start: b.start || null, end: b.end, at: b.at })),
      forecastStart: p.forecastStart || null,
      forecastEnd: p.forecastEnd || null,
      rank: Number.isFinite(p.rank) ? p.rank : null,
      evm: projectEvm(tasksOf[p._id.toString()] || [], nowMs, rates),
    })),
    // Changing the schedule is for company-wide managers (GM / CEO).
    canSchedule,
    canBill,
    // Only the viewer's department's tasks were sent: projects without any are hidden.
    departmentOnly,
    // …who also see who has free time to give work to.
    freeTime: canSchedule ? await freeTime(calendar) : [],
  });
}
