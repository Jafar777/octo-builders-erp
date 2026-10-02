import Task from "@/models/Task";
import WorkProject from "@/models/WorkProject";
import { hasPermission } from "@/lib/currentUser";
import { inScope } from "@/lib/scope";

const idStr = (v) => (v ? v.toString() : null);

// "manage", "view" or null.
export function projectAccess(user, project) {
  if (!user?.isStaff || !project) return null;
  if (hasPermission(user, "projects.manage") && inScope(user, project.department)) return "manage";
  if (hasPermission(user, "projects.view") && inScope(user, project.department)) return "view";
  if (project.participants?.some((p) => idStr(p) === user.id)) return "view";
  if (user.department && user.department === idStr(project.department)) return "view";
  return null;
}

// Mongo filter for the projects a user may list.
export function projectQueryFor(user) {
  if (user.scope === "all" && (hasPermission(user, "projects.view") || hasPermission(user, "projects.manage"))) {
    return {};
  }
  const or = [{ participants: user.id }];
  if (user.department) or.push({ department: user.department });
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
  return { cells, progress: total ? complete / total : 0, complete, total };
}

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
    stages: p.stages,
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
    stages: t.stages,
    items: t.items,
    active: t.active,
  };
}
