import Task from "@/models/Task";
import WorkProject from "@/models/WorkProject";
import Role from "@/models/Role";
import User from "@/models/User";
import { hasPermission } from "@/lib/currentUser";
import { notify } from "@/lib/notify";
import { publish } from "@/lib/realtime/server";
import { inScope, memberOrManagerOf } from "@/lib/scope";
import { getSettings } from "@/lib/settings";
import { officeDate } from "@/lib/gantt";
import { stageAfter } from "@/lib/stageFlow";
import { buildCells } from "@/lib/boardCells";

export { buildCells, lockedStages } from "@/lib/boardCells";

const idStr = (v) => (v ? v.toString() : null);

// Live board updates for everyone who can open the project, whatever their department.
export const projectChannel = (id) => `private-project-${id}`;

// Sending stages to other departments is for company-wide managers (GM / CEO).
export function canRouteStages(user) {
  return hasPermission(user, "projects.manage") && user?.scope === "all";
}

// The department doing a stage's work: its own, or the project's.
export function stageDepartment(project, stage) {
  return idStr(stage?.department) || idStr(project.department);
}

// "manage" or "view". Every employee can open any project and start tasks in it
// (people often work for other departments); managing it stays with its managers.
export function projectAccess(user, project) {
  if (!user?.isStaff || user.limited || !project) return null;
  if (hasPermission(user, "projects.manage") && inScope(user, project.department)) return "manage";
  return "view";
}

// May `user` give out tasks and set manual states in this stage?
export function canManageStage(user, project, stage) {
  if (projectAccess(user, project) === "manage") return true;
  return hasPermission(user, "projects.manage") && inScope(user, stageDepartment(project, stage));
}

// Mongo filter for the projects a user may list: all of them, for every employee.
export function projectQueryFor() {
  return {};
}

async function boardState(project) {
  const tasks = await Task.find(
    { project: project._id },
    { stage: 1, revision: 1, status: 1, kind: 1, createdAt: 1, assignee: 1, number: 1, estimatedHours: 1, maxHours: 1 }
  ).lean();
  return buildCells(project, tasks);
}

export async function isStageLocked(project, stageKey) {
  const i = project.stages.findIndex((s) => s.key === stageKey);
  if (i < 0 || !stageAfter(project.stages, i).length) return false;
  return (await boardState(project)).locked.includes(stageKey);
}

// Department managers (tasks.assign) of `departmentId`, not the company-wide ones.
async function departmentManagers(departmentId) {
  const roles = await Role.find({ permissions: "tasks.assign", scope: "department" }, { key: 1 }).lean();
  if (!roles.length) return [];
  const users = await User.find({ status: "active", ...memberOrManagerOf(departmentId), role: { $in: roles.map((r) => r.key) } }, { _id: 1 }).lean();
  return users.map((u) => u._id.toString());
}

// After work is handed in, reviewed or a cell is set manually: tell the department of each
// waiting stage that just unlocked that the project is ready for them (once).
export async function checkStageHandoffs(projectId, actor = null) {
  const project = await WorkProject.findById(projectId);
  if (!project || !project.stages.length) return;
  const { locked } = await boardState(project.toObject());
  const before = project.handedOff || [];
  const waiting = project.stages.filter((_, i) => stageAfter(project.stages, i).length);
  const ready = waiting.filter((s) => !locked.includes(s.key)).map((s) => s.key);
  // A stage that locks again (e.g. a manual state was cleared) is announced again later.
  const fresh = ready.filter((k) => !before.includes(k));
  if (!fresh.length && ready.length === before.length) return;

  project.handedOff = ready;
  await project.save();
  for (const key of fresh) {
    const stage = project.stages.find((s) => s.key === key);
    await notify({
      type: "project.stage_ready",
      recipients: await departmentManagers(stageDepartment(project, stage)),
      actor,
      params: { project: project.name?.en, projectAr: project.name?.ar, stage: stage.name?.en, stageAr: stage.name?.ar },
      link: `/dashboard/projects/${project._id}`,
      entityType: "project",
      entityId: project._id,
    });
  }
  if (fresh.length) await publish(projectChannel(idStr(project._id)), "project:updated", { id: idStr(project._id) });
}

const serializeStage = (s, i, stages) => ({
  key: s.key,
  name: s.name,
  taskType: s.taskType,
  department: idStr(s.department),
  waitForPrevious: stageAfter(stages, i).length > 0,
  after: stageAfter(stages, i),
});

export function serializeProject(p, extra = {}) {
  return {
    id: p._id.toString(),
    code: p.code,
    name: p.name,
    client: p.client,
    customer: idStr(p.customer),
    department: idStr(p.department),
    branch: idStr(p.branch),
    manager: idStr(p.manager),
    participants: (p.participants || []).map(idStr),
    status: p.status,
    priority: p.priority,
    flow: p.flow || "mixed",
    startDate: p.startDate,
    dueDate: p.dueDate,
    baselineDueDate: p.baselineDueDate,
    baselines: (p.baselines || []).map((b) => ({ n: b.n, start: b.start || null, end: b.end, at: b.at })),
    forecastStart: p.forecastStart || null,
    forecastEnd: p.forecastEnd || null,
    folderLink: p.folderLink,
    serverFolder: p.serverFolder?.path ? { vol: p.serverFolder.vol, path: p.serverFolder.path } : null,
    notes: p.notes,
    stages: (p.stages || []).map(serializeStage),
    finishedAt: p.finishedAt,
    createdAt: p.createdAt,
    ...extra,
  };
}

// The office's time zone (Settings → HR), for comparing dates as the office sees them.
export async function officeTz() {
  return (await getSettings()).hr?.timezone || "Asia/Damascus";
}

// The plan already finishes after the client's due date: the expected delivery falls on
// a later office day than the due date (a date with no time, kept as that day at 00:00 UTC).
export function dueRiskOf(p, tz) {
  if (p.status !== "active" || !p.forecastEnd || !p.dueDate) return false;
  return officeDate(new Date(p.forecastEnd).getTime(), { tz }) > new Date(p.dueDate).toISOString().slice(0, 10);
}

// Projects with progress %, open task counts and lateness for list screens.
export async function listProjectsWithProgress(query) {
  const projects = await WorkProject.find(query).sort({ status: 1, dueDate: 1 }).lean();
  const tz = await officeTz();
  const tasks = await Task.find(
    { project: { $in: projects.map((p) => p._id) } },
    { project: 1, stage: 1, revision: 1, status: 1, kind: 1, createdAt: 1, assignee: 1, dueAt: 1, number: 1, estimatedHours: 1, maxHours: 1 }
  ).lean();
  const byProject = {};
  for (const t of tasks) (byProject[idStr(t.project)] ||= []).push(t);

  const now = Date.now();
  return projects.map((p) => {
    const list = byProject[p._id.toString()] || [];
    const { progress } = buildCells(p, list);
    const open = list.filter((t) => ["todo", "in_progress", "on_hold", "help", "submitted"].includes(t.status));
    return serializeProject(p, {
      progress,
      openTasks: open.length,
      overdueTasks: open.filter((t) => t.dueAt && new Date(t.dueAt).getTime() < now).length,
      late: p.status !== "finished" && p.dueDate && new Date(p.dueDate).getTime() < now,
      dueRisk: dueRiskOf(p, tz),
    });
  });
}

export function serializeTemplate(t) {
  return {
    id: t._id.toString(),
    name: t.name,
    department: t.department ? t.department.toString() : null,
    stages: (t.stages || []).map(serializeStage),
    active: t.active,
  };
}
