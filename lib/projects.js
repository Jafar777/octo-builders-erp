import Task from "@/models/Task";
import WorkProject from "@/models/WorkProject";
import Role from "@/models/Role";
import User from "@/models/User";
import { hasPermission } from "@/lib/currentUser";
import { notify } from "@/lib/notify";
import { publish } from "@/lib/realtime/server";
import { inScope } from "@/lib/scope";

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
  if (!user?.isStaff || !project) return null;
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

const COMPLETE = ["approved", "done", "skip"];

// Board state per stage. A stage can hold several tasks (different people, and
// revision chains where a rejected task is replaced by its revision). It is complete
// once every current task is approved / done, unless a manual Skip/Done is set.
const CLOSED = ["approved", "done"];
// Which status a stage shows when its tasks differ: the most "alive" one.
const STATUS_RANK = ["in_progress", "help", "on_hold", "submitted", "todo"];

export function buildCells(project, tasks) {
  const byStage = {};
  for (const t of tasks) {
    if (t.status === "cancelled" || t.status === "rejected" || !["task", "revision"].includes(t.kind) || !t.stage) continue;
    (byStage[t.stage] ||= []).push(t);
  }

  const cells = {};
  let complete = 0;
  for (const stage of project.stages) {
    // Newest manual state of the stage.
    const override = (project.overrides || [])
      .filter((o) => o.stage === stage.key)
      .sort((a, b) => new Date(b.at) - new Date(a.at))[0];
    const list = (byStage[stage.key] || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const open = list.filter((t) => !CLOSED.includes(t.status));
    let status = "not_started";
    if (override) status = override.status;
    else if (list.length && !open.length) status = "approved";
    else if (open.length) {
      const top = STATUS_RANK.find((s) => open.some((t) => t.status === s)) || open[0].status;
      status = top === "submitted" ? "pending" : top;
    }
    const shown = open[0] || list[0];

    cells[stage.key] = {
      status,
      override: override ? { status: override.status, reason: override.reason, at: override.at } : null,
      taskId: shown ? idStr(shown._id) : null,
      number: shown?.number || null,
      revision: shown?.revision ?? null,
      assignee: shown ? idStr(shown.assignee) : null,
      count: list.length,
    };
    if (COMPLETE.includes(status)) complete += 1;
  }
  const total = project.stages.length;
  return { cells, progress: total ? complete / total : 0, complete, total, locked: lockedStages(project, cells) };
}

// Stages set to "wait for previous" stay locked until every earlier stage is
// finished (approved, done or skipped).
export function lockedStages(project, cells) {
  const locked = [];
  let earlierDone = true;
  for (const stage of project.stages) {
    if (stage.waitForPrevious && !earlierDone) locked.push(stage.key);
    earlierDone &&= COMPLETE.includes(cells[stage.key]?.status);
  }
  return locked;
}

async function boardState(project) {
  const tasks = await Task.find(
    { project: project._id },
    { stage: 1, revision: 1, status: 1, kind: 1, createdAt: 1, assignee: 1, number: 1 }
  ).lean();
  return buildCells(project, tasks);
}

export async function isStageLocked(project, stageKey) {
  const stage = project.stages.find((s) => s.key === stageKey);
  if (!stage?.waitForPrevious) return false;
  return (await boardState(project)).locked.includes(stageKey);
}

// Department managers (tasks.assign) of `departmentId`, not the company-wide ones.
async function departmentManagers(departmentId) {
  const roles = await Role.find({ permissions: "tasks.assign", scope: "department" }, { key: 1 }).lean();
  if (!roles.length) return [];
  const users = await User.find({ status: "active", department: departmentId, role: { $in: roles.map((r) => r.key) } }, { _id: 1 }).lean();
  return users.map((u) => u._id.toString());
}

// After work is approved or a cell is set manually: tell the department of each
// waiting stage that just unlocked that the project is ready for them (once).
export async function checkStageHandoffs(projectId, actor = null) {
  const project = await WorkProject.findById(projectId);
  if (!project || !project.stages.length) return;
  const { locked } = await boardState(project.toObject());
  const before = project.handedOff || [];
  const waiting = project.stages.filter((s) => s.waitForPrevious);
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

const serializeStage = (s) => ({
  key: s.key,
  name: s.name,
  taskType: s.taskType,
  department: idStr(s.department),
  waitForPrevious: Boolean(s.waitForPrevious),
});

export function serializeProject(p, extra = {}) {
  return {
    id: p._id.toString(),
    code: p.code,
    name: p.name,
    client: p.client,
    department: idStr(p.department),
    branch: idStr(p.branch),
    manager: idStr(p.manager),
    participants: (p.participants || []).map(idStr),
    status: p.status,
    priority: p.priority,
    scale: p.scale || "",
    flow: p.flow || "mixed",
    startDate: p.startDate,
    dueDate: p.dueDate,
    baselineDueDate: p.baselineDueDate,
    folderLink: p.folderLink,
    notes: p.notes,
    stages: (p.stages || []).map(serializeStage),
    finishedAt: p.finishedAt,
    createdAt: p.createdAt,
    ...extra,
  };
}

// Projects with progress %, open task counts and lateness for list screens.
export async function listProjectsWithProgress(query) {
  const projects = await WorkProject.find(query).sort({ status: 1, dueDate: 1 }).lean();
  const tasks = await Task.find(
    { project: { $in: projects.map((p) => p._id) } },
    { project: 1, stage: 1, revision: 1, status: 1, kind: 1, createdAt: 1, assignee: 1, dueAt: 1, number: 1 }
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
