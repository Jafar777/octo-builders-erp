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

const stageDepartments = (project) =>
  [...new Set((project.stages || []).map((s) => idStr(s.department)).filter(Boolean))];

// "manage", "view" or null.
export function projectAccess(user, project) {
  if (!user?.isStaff || !project) return null;
  if (hasPermission(user, "projects.manage") && inScope(user, project.department)) return "manage";
  if (hasPermission(user, "projects.view") && inScope(user, project.department)) return "view";
  if (project.participants?.some((p) => idStr(p) === user.id)) return "view";
  if (user.department && user.department === idStr(project.department)) return "view";
  // Departments doing one of the stages see the project and work on their stages.
  if (user.department && stageDepartments(project).includes(user.department)) return "view";
  return null;
}

// May `user` give out tasks and set manual states in this stage?
export function canManageStage(user, project, stage) {
  if (projectAccess(user, project) === "manage") return true;
  return hasPermission(user, "projects.manage") && inScope(user, stageDepartment(project, stage));
}

// Mongo filter for the projects a user may list.
export function projectQueryFor(user) {
  if (user.scope === "all" && (hasPermission(user, "projects.view") || hasPermission(user, "projects.manage"))) {
    return {};
  }
  const or = [{ participants: user.id }];
  if (user.department) or.push({ department: user.department }, { "stages.department": user.department });
  return { $or: or };
}

const COMPLETE = ["approved", "done", "skip"];

// Board state per cell: the latest (highest revision) non-cancelled task, unless a
// manual Skip/Done override is set.
export function buildCells(project, tasks) {
  const latest = {};
  for (const t of tasks) {
    if (t.status === "cancelled" || !["task", "revision"].includes(t.kind) || !t.item || !t.stage) continue;
    const key = `${idStr(t.item)}:${t.stage}`;
    const cur = latest[key];
    if (!cur || t.revision > cur.revision || (t.revision === cur.revision && t.createdAt > cur.createdAt)) {
      latest[key] = t;
    }
  }

  const cells = {};
  let complete = 0;
  let total = 0;
  for (const item of project.items) {
    const itemId = idStr(item._id);
    cells[itemId] = {};
    let itemComplete = 0;
    for (const stage of project.stages) {
      const override = project.overrides?.find((o) => idStr(o.item) === itemId && o.stage === stage.key);
      const task = latest[`${itemId}:${stage.key}`];
      let status = "not_started";
      if (override) status = override.status;
      else if (task) status = task.status === "submitted" ? "pending" : task.status;

      cells[itemId][stage.key] = {
        status,
        override: override ? { status: override.status, reason: override.reason, at: override.at } : null,
        taskId: task ? idStr(task._id) : null,
        number: task?.number || null,
        revision: task?.revision ?? null,
        assignee: task ? idStr(task.assignee) : null,
      };
      total += 1;
      if (COMPLETE.includes(status)) {
        complete += 1;
        itemComplete += 1;
      }
    }
    cells[itemId]._progress = project.stages.length ? itemComplete / project.stages.length : 0;
  }
  return { cells, progress: total ? complete / total : 0, complete, total, locked: lockedStages(project, cells) };
}

// Stages set to "wait for previous" stay locked until every row of every earlier
// stage is finished (approved, done or skipped).
export function lockedStages(project, cells) {
  const locked = [];
  let earlierDone = true;
  for (const stage of project.stages) {
    if (stage.waitForPrevious && !earlierDone) locked.push(stage.key);
    earlierDone &&= project.items.every((item) => COMPLETE.includes(cells[idStr(item._id)]?.[stage.key]?.status));
  }
  return locked;
}

async function boardState(project) {
  const tasks = await Task.find(
    { project: project._id },
    { item: 1, stage: 1, revision: 1, status: 1, kind: 1, createdAt: 1, assignee: 1 }
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
  if (!project || !project.items.length) return;
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
    startDate: p.startDate,
    dueDate: p.dueDate,
    baselineDueDate: p.baselineDueDate,
    folderLink: p.folderLink,
    notes: p.notes,
    stages: (p.stages || []).map(serializeStage),
    items: (p.items || [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((i) => ({ id: i._id.toString(), name: i.name, order: i.order })),
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
    { project: 1, item: 1, stage: 1, revision: 1, status: 1, kind: 1, createdAt: 1, assignee: 1, dueAt: 1 }
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
    items: t.items,
    active: t.active,
  };
}
