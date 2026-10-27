import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { makeCalendar } from "@/lib/gantt";
import { serializeMilestone } from "@/lib/ganttServer";
import { markOverrunsSoon } from "@/lib/projectDelay";
import { pickName, viewerLang } from "@/lib/personName";
import { canRouteStages, projectQueryFor } from "@/lib/projects";
import { getSettings } from "@/lib/settings";
import { enrichTasks } from "@/lib/tasks";
import Task from "@/models/Task";
import User from "@/models/User";
import WorkProject from "@/models/WorkProject";

const STATUSES = ["active", "on_hold", "finished", "archived"];
const idStr = (v) => (v ? v.toString() : null);

// Gantt data: every task of the projects I can list, the working calendar, each
// assignee's daily capacity, and the projects' milestones.
// ?status=active   (project status, default active)
export async function GET(request) {
  const user = await requireStaff();
  if (!user) return forbidden();

  // Work running late pushes the plan before it's shown.
  await markOverrunsSoon();
  const status = new URL(request.url).searchParams.get("status");
  const query = { ...projectQueryFor(user) };
  if (STATUSES.includes(status)) query.status = status;

  const [projects, settings] = await Promise.all([
    WorkProject.find(query, { milestones: 1, taskBaselineAt: 1, baselines: 1, forecastStart: 1, forecastEnd: 1 }).lean(),
    getSettings(),
  ]);
  const tasks = await Task.find({ project: { $in: projects.map((p) => p._id) }, status: { $ne: "cancelled" } })
    .sort({ plannedStart: 1, createdAt: 1 })
    .limit(3000)
    .lean();

  const assigneeIds = [...new Set(tasks.map((t) => idStr(t.assignee)))];
  const people = await User.find({ _id: { $in: assigneeIds } }, { name: 1, nameAr: 1, email: 1, avatarUrl: 1, workSchedule: 1 }).lean();
  const lang = await viewerLang();

  return NextResponse.json({
    tasks: await enrichTasks(tasks),
    calendar: makeCalendar(settings),
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
    })),
    // Changing the schedule is for company-wide managers (GM / CEO).
    canSchedule: canRouteStages(user),
  });
}
