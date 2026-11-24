// Temporary department merges (models/DepartmentMerge.js), set by the CEO:
//   - the chosen manager heads every merged department: the ones they didn't head yet
//     are added to their User.managedDepartments (and recorded on the merge), so
//     scope, reviews, approvals, chat channels and the chart all follow by themselves;
//   - the employees of each merged department can be given the work of all of them
//     (worked out when read, in lib/roles.js withWorkDepartments, so people who join a
//     merged department later are covered too);
//   - in the chart, the merged departments' other heads report to that manager.
// Ending a merge takes away exactly what it added.
import DepartmentMerge from "@/models/DepartmentMerge";
import Department from "@/models/Department";
import Role from "@/models/Role";
import User from "@/models/User";
import { audit } from "@/lib/audit";
import { syncStaffChannels } from "@/lib/messaging";
import { notify } from "@/lib/notify";
import { liveFilter } from "@/lib/mergeState";
import { followManagerChange } from "@/lib/managerChange";

const idStr = (v) => (v ? v.toString() : null);

// A department manager's role: works on department scope and reviews its tasks
// (the same test as the chart, lib/hierarchy.js).
export const isHeadRole = (role) => role?.scope === "department" && (role.permissions || []).includes("tasks.review");

// Managers who can lead a merge: active people whose role heads a department.
export async function mergeManagerCandidates() {
  const roles = await Role.find({ scope: "department", permissions: "tasks.review" }, { key: 1 }).lean();
  if (!roles.length) return [];
  return User.find(
    { status: "active", role: { $in: roles.map((r) => r.key) } },
    { name: 1, nameAr: 1, email: 1, avatarUrl: 1, department: 1, managedDepartments: 1, role: 1 }
  )
    .sort({ name: 1 })
    .lean();
}

async function applyMerge(merge) {
  const manager = await User.findById(merge.manager, { department: 1, managedDepartments: 1 }).lean();
  const already = new Set([idStr(manager?.department), ...(manager?.managedDepartments || []).map(idStr)]);
  const added = merge.departments.map(idStr).filter((d) => !already.has(d));
  if (added.length) await User.updateOne({ _id: merge.manager }, { $addToSet: { managedDepartments: { $each: added } } });
  merge.addedManaged = added;
}

async function revertMerge(merge) {
  const added = (merge.addedManaged || []).map(idStr);
  // Another live merge may still need some of them for the same manager.
  const others = await DepartmentMerge.find({ ...liveFilter(), _id: { $ne: merge._id }, manager: merge.manager }, { departments: 1 }).lean();
  const stillNeeded = new Set(others.flatMap((m) => m.departments.map(idStr)));
  const pull = added.filter((d) => !stillNeeded.has(d));
  if (pull.length) await User.updateOne({ _id: merge.manager }, { $pull: { managedDepartments: { $in: pull } } });
  merge.addedManaged = [];
}

// Everyone a merge concerns: its manager and the members of its departments.
async function peopleOf(merge) {
  const members = await User.find({ status: "active", department: { $in: merge.departments } }, { _id: 1 }).lean();
  return [...new Set([idStr(merge.manager), ...members.map((u) => idStr(u._id))])];
}

async function names(ids) {
  const list = await Department.find({ _id: { $in: ids } }, { name: 1 }).lean();
  const byId = Object.fromEntries(list.map((d) => [idStr(d._id), d.name]));
  const pick = (lang) => ids.map((id) => byId[idStr(id)]?.[lang] || "").filter(Boolean).join(" + ");
  return { en: pick("en"), ar: pick("ar") };
}

// "" / null = no end date; otherwise a valid date (undefined = invalid).
export function parseEndsAt(value) {
  if (value === null || value === "" || value === undefined) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// Checks a merge request; returns an error code or null.
// `departments` / `managerId` are strings; `ignoreId` = the merge being edited.
export async function checkMerge({ departments, managerId, endsAt }, ignoreId = null) {
  if (departments.length < 2) return "merge_two_departments";
  const found = await Department.find({ _id: { $in: departments }, active: { $ne: false } }, { _id: 1 }).lean();
  if (found.length !== departments.length) return "invalid_request";
  const busy = await DepartmentMerge.exists({ ...liveFilter(), departments: { $in: departments }, ...(ignoreId ? { _id: { $ne: ignoreId } } : {}) });
  if (busy) return "merge_department_busy";
  const manager = await User.findOne({ _id: managerId, status: "active" }, { role: 1 }).lean();
  if (!manager || !isHeadRole(await Role.findOne({ key: manager.role }, { scope: 1, permissions: 1 }).lean())) return "merge_manager_invalid";
  if (endsAt && endsAt.getTime() <= Date.now()) return "merge_end_past";
  return null;
}

export async function createMerge(actor, { departments, managerId, endsAt, note }) {
  const merge = new DepartmentMerge({ departments, manager: managerId, endsAt, note, createdBy: actor.id });
  await applyMerge(merge);
  await merge.save();
  await syncStaffChannels();
  const label = await names(departments);
  // What waits for a manager in the merged departments (leave, overtime, reviews)
  // goes to the merge's manager.
  await followManagerChange(await peopleOf(merge), actor);
  await audit(actor, "departments.merged", { entityType: "departments", entityId: merge._id, summary: label.en, details: { departments, manager: managerId, endsAt } });
  await notify({
    type: "org.merge_started",
    recipients: await peopleOf(merge),
    actor,
    params: { departments: label.en },
    paramsAr: { departments: label.ar },
    link: "/dashboard/organization",
  });
  return merge;
}

// New manager / end date / note for a live merge.
export async function updateMerge(actor, merge, { managerId, endsAt, note }) {
  if (managerId && managerId !== idStr(merge.manager)) {
    await revertMerge(merge);
    merge.manager = managerId;
    await applyMerge(merge);
  }
  if (endsAt !== undefined) merge.endsAt = endsAt;
  if (note !== undefined) merge.note = note;
  await merge.save();
  await syncStaffChannels();
  await followManagerChange(await peopleOf(merge), actor);
  await audit(actor, "departments.merge_updated", { entityType: "departments", entityId: merge._id, details: { manager: idStr(merge.manager), endsAt: merge.endsAt } });
  return merge;
}

export async function endMerge(actor, merge) {
  const recipients = await peopleOf(merge);
  await revertMerge(merge);
  merge.status = "ended";
  merge.endedAt = new Date();
  merge.endedBy = actor?.id || null;
  await merge.save();
  await syncStaffChannels();
  // ...and back to each department's own manager.
  await followManagerChange(recipients, actor);
  const label = await names(merge.departments);
  await audit(actor, "departments.unmerged", { entityType: "departments", entityId: merge._id, summary: label.en });
  await notify({
    type: "org.merge_ended",
    recipients,
    actor,
    params: { departments: label.en },
    paramsAr: { departments: label.ar },
    link: "/dashboard/organization",
  });
  return merge;
}

// Merges whose end date has passed are ended for real (the manager loses the extra
// departments). Runs with the daily jobs and, at most every few minutes, on requests.
let lastSweep = 0;
export async function endExpiredMerges({ force = false } = {}) {
  if (!force && Date.now() - lastSweep < 5 * 60 * 1000) return 0;
  lastSweep = Date.now();
  const due = await DepartmentMerge.find({ status: "active", endsAt: { $ne: null, $lte: new Date() } });
  for (const merge of due) await endMerge(null, merge);
  return due.length;
}

export function serializeMerge(m) {
  return {
    id: m._id.toString(),
    departments: (m.departments || []).map(idStr),
    manager: idStr(m.manager),
    note: m.note || "",
    endsAt: m.endsAt || null,
    status: m.status,
    createdAt: m.createdAt,
    endedAt: m.endedAt || null,
  };
}
