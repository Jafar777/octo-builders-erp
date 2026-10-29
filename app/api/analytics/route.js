import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { localParts } from "@/lib/attendance";
import { monthWorkHours } from "@/lib/workDays";
import { hrStaff, todayIn } from "@/lib/hr";
import { buildCells } from "@/lib/projects";
import { lateTaskCount, projectRisk, projectScore, rejectionCount } from "@/lib/projectHealth";
import { getSettings } from "@/lib/settings";
import { loadFinance } from "@/lib/finance";
import LeaveRequest from "@/models/LeaveRequest";
import RawPunch from "@/models/RawPunch";
import Task from "@/models/Task";
import WorkProject from "@/models/WorkProject";

const OPEN = ["todo", "in_progress", "on_hold", "help"];
const idStr = (v) => (v ? v.toString() : null);

function addMonths(month, n) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

export async function GET() {
  const user = await requireStaff();
  if (!user || !hasPermission(user, "analytics.view")) return forbidden();

  const settings = await getSettings();
  const tz = settings.hr.timezone;
  const today = todayIn(tz);
  const month = today.slice(0, 7);
  const now = Date.now();
  const deptFilter = user.scope === "all" ? {} : { department: user.department };

  // A department head also follows the projects where their department does a stage.
  const projectFilter = user.scope === "all" ? {} : { $or: [{ department: user.department }, { "stages.department": user.department }] };
  const TASK_FIELDS = {
    status: 1, kind: 1, type: 1, dueAt: 1, submittedAt: 1, reviewedAt: 1, assignee: 1, project: 1, item: 1,
    stage: 1, revision: 1, createdAt: 1, estimatedHours: 1, maxHours: 1, title: 1, department: 1, number: 1, activeMs: 1,
  };
  const [tasks, projects, staff] = await Promise.all([
    Task.find(deptFilter, TASK_FIELDS).lean(),
    WorkProject.find({ ...projectFilter, status: { $in: ["active", "on_hold", "finished"] } }).lean(),
    hrStaff({ status: "active", ...(user.scope === "all" ? {} : { department: user.department }) }),
  ]);
  // Project KPIs need every task of the project, whichever department did it.
  const projectTasks = await Task.find({ project: { $in: projects.map((p) => p._id) } }, TASK_FIELDS).lean();

  // Counters
  const open = tasks.filter((t) => OPEN.includes(t.status));
  const monthOf = (d) => (d ? localParts(new Date(d), tz).date.slice(0, 7) : null);
  const counters = {
    open: open.length,
    submitted: tasks.filter((t) => t.status === "submitted").length,
    overdue: open.filter((t) => t.dueAt && new Date(t.dueAt).getTime() < now).length,
    approvedThisMonth: tasks.filter((t) => t.status === "approved" && monthOf(t.reviewedAt) === month).length,
    rejectedThisMonth: tasks.filter((t) => t.status === "rejected" && monthOf(t.reviewedAt) === month).length,
    activeProjects: projects.filter((p) => p.status === "active").length,
  };

  // Approved vs rejected, last 6 months
  const months = Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5));
  const trend = months.map((m) => ({
    month: m,
    approved: tasks.filter((t) => t.status === "approved" && monthOf(t.reviewedAt) === m).length,
    rejected: tasks.filter((t) => t.status === "rejected" && monthOf(t.reviewedAt) === m).length,
  }));

  // Task mix this month (submitted work by type)
  const byType = {};
  for (const t of tasks) {
    if (monthOf(t.submittedAt) === month && ["task", "revision"].includes(t.kind)) byType[t.type || "other"] = (byType[t.type || "other"] || 0) + 1;
  }

  // Project health (+ project KPI; the cost part needs finance data, GM/CEO only)
  const costs = {};
  if (hasPermission(user, "finance.view") && projects.some((p) => p.budget > 0)) {
    const finance = await loadFinance(today.slice(0, 4));
    for (const fp of finance.projects) costs[fp.id] = fp.cost;
  }
  const byProject = {};
  for (const t of projectTasks) (byProject[idStr(t.project)] ||= []).push(t);
  const health = projects
    .map((p) => {
      const list = byProject[p._id.toString()] || [];
      const { progress, complete, total } = buildCells(p, list);
      const lateTasks = lateTaskCount(list, now);
      const rejections = rejectionCount(list);
      const finished = p.status === "finished";
      // A finished project is judged at the day it finished, not today.
      const at = finished ? new Date(p.finishedAt || p.updatedAt).getTime() : now;
      const risk = projectRisk(p, finished ? 1 : progress, lateTasks, rejections, at);
      return {
        id: p._id.toString(),
        name: p.name,
        code: p.code,
        status: p.status,
        department: idStr(p.department),
        startDate: p.startDate || p.createdAt,
        dueDate: p.dueDate,
        finishedAt: finished ? p.finishedAt || p.updatedAt : null,
        daysLeft: Math.ceil((new Date(p.dueDate).getTime() - at) / 86400000),
        progress: Math.round(progress * 100),
        stagesDone: complete,
        stagesTotal: total,
        openTasks: list.filter((t) => OPEN.includes(t.status)).length,
        totalTasks: list.filter((t) => ["task", "revision"].includes(t.kind) && t.status !== "cancelled").length,
        lateTasks,
        rejections,
        hoursWorked: Math.round(list.reduce((h, t) => h + (t.activeMs || 0), 0) / 360000) / 10,
        participants: new Set(list.map((t) => idStr(t.assignee))).size,
        ...risk,
        kpi: projectScore(list, {
          budget: p.budget || 0,
          cost: costs[p._id.toString()] ?? null,
          now: at,
          baseline: (p.baselines || []).find((b) => b.n === 1) || null,
          // The expected delivery: once finished, when its last task was handed in.
          end: p.forecastEnd || (finished ? p.finishedAt : null),
        }),
      };
    })
    .sort((a, b) => b.score - a.score);

  // Live team board
  const [todayPunches, leavesToday] = await Promise.all([
    RawPunch.find({ time: { $gte: new Date(now - 36 * 3600000) } }, { badgeId: 1, time: 1 }).lean(),
    LeaveRequest.find({ status: "approved", from: { $lte: today }, to: { $gte: today } }, { user: 1, type: 1 }).lean(),
  ]);
  const punchedToday = new Set(todayPunches.filter((p) => localParts(p.time, tz).date === today).map((p) => p.badgeId));
  const team = staff.map((s) => {
    const mine = open.filter((t) => idStr(t.assignee) === s.id);
    const working = mine.find((t) => t.status === "in_progress");
    const leave = leavesToday.find((l) => idStr(l.user) === s.id);
    return {
      id: s.id,
      name: s.name,
      avatarUrl: s.avatarUrl,
      department: s.department,
      presence: leave ? `${leave.type}_leave` : s.badgeId && punchedToday.has(s.badgeId) ? "present" : s.badgeId ? "not_in" : "no_badge",
      workingOn: working ? { id: working._id.toString(), number: working.number, title: working.title, projectId: idStr(working.project) } : null,
      openTasks: mine.length,
      reservedHours: mine.reduce((a, t) => a + (t.estimatedHours || 0), 0),
    };
  });

  // Capacity per department: this month + next 2
  const departments = [...new Set(staff.map((s) => s.department).filter(Boolean))];
  const capacity = departments.map((dep) => {
    const people = staff.filter((s) => s.department === dep).length;
    return {
      department: dep,
      people,
      months: [0, 1, 2].map((i) => {
        const m = addMonths(month, i);
        const available = people * monthWorkHours(m, settings);
        const reserved = open
          .filter((t) => idStr(t.department) === dep)
          .filter((t) => (t.dueAt ? monthOf(t.dueAt) === m : i === 0) || (i === 0 && t.dueAt && monthOf(t.dueAt) < month))
          .reduce((a, t) => a + (t.estimatedHours || 0), 0);
        return { month: m, available, reserved: Math.round(reserved * 10) / 10, load: available ? Math.round((reserved / available) * 100) : 0 };
      }),
    };
  });

  return NextResponse.json({ month, counters, trend, byType, health, team, capacity });
}
