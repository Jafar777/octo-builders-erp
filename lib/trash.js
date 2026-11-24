// Deleting projects and tasks (people with projects.delete: the CEO by default).
// A deleted project takes its tasks, their history and the project's file records with it
// into Deleted items (models/Trash): nothing shows it any more, but it can be restored
// exactly as it was for TRASH_DAYS days; after that the daily job erases it for good.
// Finance records (invoices, ledger entries, purchases) are never deleted: the company's
// accounts must stay complete, so they keep pointing at the deleted project's id.

import mongoose from "mongoose";
import { hasPermission } from "@/lib/currentUser";
import { inScope, userDepartments } from "@/lib/scope";
import Trash from "@/models/Trash";
import WorkProject from "@/models/WorkProject";
import Task from "@/models/Task";
import TaskActivity from "@/models/TaskActivity";
import ProjectFile from "@/models/ProjectFile";

export const TRASH_DAYS = 30;
export const canDelete = (user) => Boolean(user?.isStaff && hasPermission(user, "projects.delete"));
// ...within the data scope the Roles page gives them: the whole company, or the projects
// and tasks of their own departments.
export const canDeleteIn = (user, departmentId) => canDelete(user) && inScope(user, departmentId);

// The Deleted items they see and may restore or erase: their departments' (or all).
export function trashScope(user) {
  if (user.scope === "all") return {};
  const ids = user.scope === "department" ? userDepartments(user).map((d) => new mongoose.Types.ObjectId(String(d))) : [];
  return {
    $or: [
      { kind: "project", "docs.workprojects.department": { $in: ids } },
      { kind: "task", "docs.tasks.department": { $in: ids } },
    ],
  };
}
export async function canTouchTrash(user, trashId) {
  if (!canDelete(user)) return false;
  return Boolean(await coll(Trash).findOne({ _id: new mongoose.Types.ObjectId(String(trashId)), ...trashScope(user) }, { projection: { _id: 1 } }));
}

const coll = (Model) => Model.collection;
const COLLECTIONS = { workprojects: WorkProject, tasks: Task, taskactivities: TaskActivity, projectfiles: ProjectFile };

async function store(kind, refId, label, docs, user) {
  const counts = Object.fromEntries(Object.entries(docs).map(([k, v]) => [k, v.length]));
  const now = new Date();
  // Straight to the collection: the documents are kept exactly as stored (ids, dates).
  await coll(Trash).insertOne({
    kind,
    refId,
    label,
    counts,
    docs,
    deletedBy: user ? new mongoose.Types.ObjectId(user.id) : null,
    deletedAt: now,
    purgeAt: new Date(now.getTime() + TRASH_DAYS * 86400000),
  });
  for (const [name, list] of Object.entries(docs)) {
    if (list.length) await coll(COLLECTIONS[name]).deleteMany({ _id: { $in: list.map((d) => d._id) } });
  }
  return counts;
}

export async function trashProject(projectId, user) {
  const _id = new mongoose.Types.ObjectId(String(projectId));
  const project = await coll(WorkProject).findOne({ _id });
  if (!project) return null;
  const tasks = await coll(Task).find({ project: _id }).toArray();
  const docs = {
    workprojects: [project],
    tasks,
    taskactivities: await coll(TaskActivity).find({ task: { $in: tasks.map((t) => t._id) } }).toArray(),
    projectfiles: await coll(ProjectFile).find({ project: _id }).toArray(),
  };
  return store("project", _id, project.name?.ar || project.name?.en || project.code || "", docs, user);
}

export async function trashTask(taskId, user) {
  const _id = new mongoose.Types.ObjectId(String(taskId));
  const task = await coll(Task).findOne({ _id });
  if (!task) return null;
  const docs = { tasks: [task], taskactivities: await coll(TaskActivity).find({ task: _id }).toArray() };
  return store("task", _id, `#${task.number}${task.title ? ` ${task.title}` : ""}`, docs, user);
}

// Puts everything back as it was. A deleted task whose project is itself deleted comes
// back only with the project.
export async function restoreTrash(trashId) {
  const item = await coll(Trash).findOne({ _id: new mongoose.Types.ObjectId(String(trashId)) });
  if (!item) return { error: "not_found" };
  if (item.kind === "task") {
    const projectId = item.docs.tasks?.[0]?.project;
    if (projectId && !(await coll(WorkProject).findOne({ _id: projectId }, { projection: { _id: 1 } }))) return { error: "project_deleted" };
  }
  for (const [name, list] of Object.entries(item.docs || {})) {
    if (!list?.length) continue;
    // Skip anything that exists again (e.g. restored twice).
    const existing = new Set((await coll(COLLECTIONS[name]).find({ _id: { $in: list.map((d) => d._id) } }, { projection: { _id: 1 } }).toArray()).map((d) => String(d._id)));
    const fresh = list.filter((d) => !existing.has(String(d._id)));
    if (fresh.length) await coll(COLLECTIONS[name]).insertMany(fresh, { ordered: false });
  }
  await coll(Trash).deleteOne({ _id: item._id });
  return { item };
}

export async function purgeTrash(trashId) {
  const res = await coll(Trash).deleteOne({ _id: new mongoose.Types.ObjectId(String(trashId)) });
  return res.deletedCount > 0;
}

// Daily: erase what has been in Deleted items longer than TRASH_DAYS.
export async function purgeExpiredTrash(now = new Date()) {
  const res = await coll(Trash).deleteMany({ purgeAt: { $lte: now } });
  return { erased: res.deletedCount };
}

export function serializeTrash(item, names = {}) {
  return {
    id: String(item._id),
    kind: item.kind,
    refId: String(item.refId),
    label: item.label,
    counts: item.counts || {},
    deletedBy: item.deletedBy ? names[String(item.deletedBy)] || null : null,
    deletedAt: item.deletedAt,
    purgeAt: item.purgeAt,
  };
}
