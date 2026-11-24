// "Add project data" (System page, the CEO): brings the old Excel program's Access file up
// to date here while the company still works in both. Temporary, until Excel is dropped.
//
//   - rows never imported are added (with their project, stage, revision chain);
//   - tasks imported before follow the file (status, dates, notes…) as long as nobody
//     worked on them here — anything done in this system always wins and is only reported;
//   - rows deleted here aren't brought back (older than what was already imported).
//
// The mapping itself is scripts/legacy/mapping.mjs (the first import). One plan is made
// for the preview and again when confirming; everything is written in one transaction.
import crypto from "node:crypto";
import mongoose from "mongoose";
import MDBReader from "mdb-reader";
import { buildPlan, normalizeAr } from "@/scripts/legacy/mapping.mjs";
import { getSettings } from "@/lib/settings";
import { todayIn } from "@/lib/hr";
import { audit } from "@/lib/audit";
import { publish } from "@/lib/realtime/server";
import { COMPANY_TASKS_CHANNEL } from "@/lib/tasks";
import { HIDDEN_ROLES, isTopRole } from "@/lib/permissions";
import { NAME_FIELDS, pickName, viewerLang } from "@/lib/personName";
import { nextNumber } from "@/models/Counter";
import Department from "@/models/Department";
import LegacyImport from "@/models/LegacyImport";
import ProjectTemplate from "@/models/ProjectTemplate";
import Setting from "@/models/Setting";
import Task from "@/models/Task";
import TaskActivity from "@/models/TaskActivity";
import Trash from "@/models/Trash";
import User from "@/models/User";
import WorkProject from "@/models/WorkProject";

export const MAX_ACCESS_BYTES = 100 * 1024 * 1024;
export const canImportLegacy = (user) => Boolean(user?.isStaff && isTopRole(user.role));

const S = (v) => (v ? String(v) : "");
const TASKS = "Tasks Records";
const REGISTRY = "Project_Status_Registry";
const NEEDED = ["ID", "القسم", "المهندس", "المشروع", "Employee Status", "Head Status", "Revision", "وقت و تاريخ البدء"];
const OPEN = ["todo", "in_progress", "on_hold", "help", "submitted"];

export class ImportError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// The file → the rows the mapping reads. Access keeps office time without a zone; the
// reader hands it over as if it were UTC, so it's written back without one.
export function readAccess(buffer) {
  let reader;
  let names;
  try {
    reader = new MDBReader(buffer);
    names = reader.getTableNames();
  } catch {
    throw new ImportError("access_unreadable");
  }
  if (!names.includes(TASKS) || !names.includes(REGISTRY)) throw new ImportError("access_wrong_file");
  const rows = (name) => {
    const t = reader.getTable(name);
    if (name === TASKS && NEEDED.some((c) => !t.getColumnNames().includes(c))) throw new ImportError("access_wrong_file");
    return t.getData().map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString().slice(0, 19) : Buffer.isBuffer(v) ? null : v])));
  };
  try {
    return { tasks: rows(TASKS), registry: rows(REGISTRY) };
  } catch (err) {
    if (err instanceof ImportError) throw err;
    throw new ImportError("access_unreadable");
  }
}

// What an imported task takes from the file again, and what decides it changed.
const COMPARED = ["status", "assignee", "startedAt", "dueAt", "submittedAt", "activeMs", "holdMs", "deliveryLink", "employeeNotes", "headNotes", "ratings", "rejectCause"];
const FOLLOWED = [...COMPARED, "plannedStart", "lastResumedAt", "pausedAt", "reviewedBy", "reviewedAt", "reviewLevel", "reviews", "cancelledAt", "cancelledBy", "cancelReason"];
const flat = (v) => (v instanceof Date ? String(Math.floor(v.getTime() / 1000)) : Array.isArray(v) ? [...v].map(String).sort().join() : v === null || v === undefined ? "" : String(v));
const differs = (doc, task) => COMPARED.filter((k) => flat(doc[k]) !== flat(task[k]));
const placeKey = (t) => [S(t.project), t.stage || "", normalizeAr(t.title || ""), t.revision || 0].join("|");

// `people`: { name in the file: account id } chosen in the preview.
export async function buildSync(data, user, people = {}) {
  const settings = await getSettings();
  const tz = settings.hr?.timezone || "Asia/Damascus";
  const [users, departments, projects, templates, imported, native, trashed, lastRun] = await Promise.all([
    User.find({ role: { $nin: HIDDEN_ROLES } }, { ...NAME_FIELDS, email: 1, name: 1, nameAr: 1, firstName: 1, lastName: 1, role: 1, department: 1, managedDepartments: 1, badgeId: 1, status: 1 }).lean(),
    Department.find().lean(),
    WorkProject.find({}, { name: 1, code: 1, department: 1, stages: 1, overrides: 1, legacyKey: 1, status: 1 }).lean(),
    ProjectTemplate.find().lean(),
    Task.find({ "legacy.source": { $in: ["excel", "excel-redo"] } }).lean(),
    Task.find({ "legacy.source": { $exists: false }, project: { $ne: null } }, { project: 1, stage: 1, title: 1, revision: 1, number: 1 }).lean(),
    Trash.collection.find({ "docs.tasks.legacy.source": "excel" }, { projection: { "docs.tasks.legacy": 1 } }).toArray(),
    LegacyImport.findOne().sort({ maxId: -1 }).lean(),
  ]);
  // Departments that moved to this system (lib/hybrid.js): their work from that day on is
  // only kept here.
  const deptOf = Object.fromEntries(users.map((u) => [S(u._id), S(u.department)]));
  const movedOn = (assignee) => settings.hybrid?.departments?.[deptOf[S(assignee)]] || null;
  const byOld = new Map(imported.filter((t) => t.legacy.source === "excel").map((t) => [t.legacy.id, t]));
  const redosHere = imported.filter((t) => t.legacy.source === "excel-redo");
  const activity = await TaskActivity.distinct("task", { task: { $in: imported.map((t) => t._id) } });
  const touched = new Set(activity.map(S));
  const emailOf = Object.fromEntries(users.map((u) => [S(u._id), u.email]));

  // Each name goes to the account its earlier rows went to, unless the CEO says otherwise.
  const votes = {};
  for (const r of data.tasks) {
    const t = byOld.get(Number(r.ID));
    const name = String(r["المهندس"] || "").trim();
    if (!t || !name || touched.has(S(t._id))) continue;
    const v = (votes[name] ||= {});
    v[S(t.assignee)] = (v[S(t.assignee)] || 0) + 1;
  }
  const peopleMap = {};
  for (const [name, v] of Object.entries(votes)) {
    const top = Object.entries(v).sort((a, b) => b[1] - a[1])[0][0];
    if (emailOf[top]) peopleMap[name] = emailOf[top];
  }
  for (const [name, id] of Object.entries(people)) if (emailOf[S(id)]) peopleMap[name] = emailOf[S(id)];

  const plan = buildPlan(
    { ...data, rawLogs: [], overrides: [], kpiArchive: [], employees: [] },
    {
      users,
      departments,
      projects,
      templates,
      settings,
      existingNumbers: new Set(),
      existingLegacyIds: new Set(),
      existingLegacyRedos: new Set(),
      actorId: user.id,
      newId: () => new mongoose.Types.ObjectId(),
      tz,
      today: todayIn(tz),
      peopleMap,
      createMissing: true,
      renumber: true,
      nextNumber: 0,
    }
  );

  // ----- each row of the file against what's here -----
  const seenMax = Math.max(0, lastRun?.maxId || 0, ...byOld.keys());
  const inTrash = new Set(trashed.flatMap((x) => (x.docs?.tasks || []).map((t) => t.legacy?.id)));
  const idHere = {}; // plan id → the id it has (or gets) here
  const added = [];
  const replaced = []; // a waiting redo made by an earlier import, now a real row in the file
  const changed = [];
  const conflicts = [];
  const leftOut = []; // deleted here
  const keptHere = []; // of a department that works here now
  const redoByPlace = new Map(redosHere.filter((t) => t.status === "todo" && !touched.has(S(t._id))).map((t) => [placeKey(t), t]));
  for (const doc of plan.tasks) {
    const here = byOld.get(doc.legacy.id);
    if (here) {
      idHere[S(doc._id)] = here._id;
      const fields = differs(doc, here);
      if (!fields.length) continue;
      (touched.has(S(here._id)) || movedOn(here.assignee) ? conflicts : changed).push({ doc, here, fields });
      continue;
    }
    if (inTrash.has(doc.legacy.id) || doc.legacy.id <= seenMax) {
      leftOut.push(doc);
      continue;
    }
    const since = movedOn(doc.assignee);
    if (since && doc.startedAt >= new Date(since)) {
      keptHere.push(doc);
      continue;
    }
    const redo = redoByPlace.get(placeKey(doc));
    if (redo) {
      redoByPlace.delete(placeKey(doc));
      idHere[S(doc._id)] = redo._id;
      replaced.push({ doc, here: redo });
    } else {
      idHere[S(doc._id)] = doc._id;
      added.push(doc);
    }
  }
  const fresh = [...added, ...replaced.map((x) => x.doc)];
  for (const doc of fresh) {
    if (!doc.previousTask) continue;
    const prev = idHere[S(doc.previousTask)];
    doc.previousTask = prev || null;
  }

  // Redos the old board waits for: only of work that's new here, or rejected just now.
  const rejectedNow = new Set([...fresh.filter((d) => d.status === "rejected"), ...changed.filter((c) => c.doc.status === "rejected" && c.here.status !== "rejected").map((c) => c.doc)].map((d) => S(d._id)));
  const haveRedo = new Set(redosHere.map((t) => t.legacy.id));
  const revised = new Set((await Task.distinct("previousTask", { previousTask: { $in: [...rejectedNow].map((id) => idHere[id]).filter(Boolean) } })).map(S));
  const redos = plan.redos.filter((r) => rejectedNow.has(S(r.previousTask)) && !haveRedo.has(r.legacy.id) && !revised.has(S(idHere[S(r.previousTask)])));
  for (const r of redos) r.previousTask = idHere[S(r.previousTask)];

  // ----- only what the new rows need -----
  const coming = [...fresh, ...redos];
  const usedProjects = new Set(coming.map((t) => S(t.project)));
  const usedPeople = new Set([...coming, ...changed.map((c) => c.doc)].flatMap((t) => [S(t.assignee), S(t.reviewedBy)]));
  const usedDepartments = new Set(coming.map((t) => S(t.department)));
  const newProjects = plan.newProjects.filter((p) => usedProjects.has(S(p._id)));
  const newUsers = plan.newUsers.filter((u) => usedPeople.has(S(u._id)));
  const newDepartments = plan.newDepartments.filter((d) => usedDepartments.has(S(d._id)) || newProjects.some((p) => S(p.department) === S(d._id)));
  const projectUpdates = [];
  for (const u of plan.projectUpdates) {
    if (!usedProjects.has(S(u._id))) continue;
    const mine = coming.filter((t) => S(t.project) === S(u._id));
    const stages = new Set(mine.map((t) => t.stage));
    const now = projects.find((p) => S(p._id) === S(u._id));
    projectUpdates.push({
      _id: u._id,
      name: u.name,
      addStages: u.addStages.filter((s) => stages.has(s.key)),
      participants: [...new Set(mine.map((t) => S(t.assignee)))],
      reopen: now?.status === "finished" && mine.some((t) => OPEN.includes(t.status)),
      closed: now?.status === "archived" || now?.status === "on_hold" ? now.status : "",
    });
  }

  // The same piece of work already added by hand here.
  const nativeByPlace = new Map(native.map((t) => [placeKey(t), t]));
  const twins = added.map((d) => ({ doc: d, here: nativeByPlace.get(placeKey(d)) })).filter((x) => x.here);

  const digest = crypto
    .createHash("sha256")
    .update(JSON.stringify([added.map((d) => d.legacy.id), replaced.map((x) => [x.doc.legacy.id, S(x.here._id)]), changed.map((c) => [S(c.here._id), S(c.here.updatedAt), c.fields, c.doc.status]), redos.map((r) => r.legacy.id), newProjects.map((p) => p.legacyKey), newUsers.map((u) => u.name), peopleMap]))
    .digest("hex");

  return {
    digest,
    rows: data.tasks.length,
    maxId: Math.max(seenMax, ...data.tasks.map((r) => Number(r.ID) || 0)),
    added,
    replaced,
    changed,
    conflicts,
    leftOut,
    keptHere,
    redos,
    twins,
    newProjects,
    newUsers,
    newDepartments,
    projectUpdates,
    skipped: plan.report.skipped.filter((x) => x.id && !byOld.has(x.id) && x.id > seenMax),
    warnings: [...new Set(plan.report.warnings)],
    users,
    projects,
  };
}

// The plan as the preview shows it.
export async function describeSync(sync) {
  const lang = await viewerLang();
  const name = Object.fromEntries([...sync.users, ...sync.newUsers].map((u) => [S(u._id), pickName(u, lang) || u.name]));
  const project = Object.fromEntries([...sync.projects, ...sync.newProjects].map((p) => [S(p._id), p.name?.[lang] || p.name?.ar || ""]));
  const row = (d, here) => ({ id: d.legacy.id, number: here?.number || null, taskId: here ? S(here._id) : null, project: project[S(d.project)] || "", title: d.title || "", stage: d.stage, revision: d.revision, assignee: name[S(d.assignee)] || "", status: d.status, was: here?.status || null });
  return {
    digest: sync.digest,
    rows: sync.rows,
    added: [...sync.added.map((d) => row(d)), ...sync.replaced.map((x) => row(x.doc, x.here))],
    changed: sync.changed.map((c) => ({ ...row(c.doc, c.here), fields: c.fields })),
    conflicts: sync.conflicts.map((c) => ({ ...row(c.doc, c.here), fields: c.fields })),
    leftOut: sync.leftOut.map((d) => row(d)),
    keptHere: sync.keptHere.map((d) => row(d)),
    redos: sync.redos.length,
    twins: sync.twins.map((x) => ({ ...row(x.doc), here: x.here.number })),
    newProjects: sync.newProjects.map((p) => p.name.ar),
    newStages: sync.projectUpdates.filter((u) => u.addStages.length).map((u) => ({ project: u.name, stages: u.addStages.map((s) => s.name?.[lang] || s.key) })),
    reopened: sync.projectUpdates.filter((u) => u.reopen).map((u) => u.name),
    closed: sync.projectUpdates.filter((u) => u.closed).map((u) => ({ project: u.name, status: u.closed })),
    newPeople: sync.newUsers.map((u) => u.name),
    skipped: sync.skipped,
    warnings: sync.warnings,
    accounts: sync.users.filter((u) => u.status !== "inactive" && u.role !== "user").map((u) => ({ id: S(u._id), name: name[S(u._id)] })),
  };
}

export const syncIsEmpty = (s) => !s.added.length && !s.replaced.length && !s.changed.length && !s.redos.length;

// Through the model (defaults, types), keeping the old dates as given.
async function rawDocs(Model, docs) {
  const out = [];
  for (const d of docs) {
    const m = new Model(d);
    await m.validate();
    out.push(m.toObject({ depopulate: true }));
  }
  return out;
}

const LOCK = "_legacy_import_lock";
async function locked(work) {
  const now = new Date();
  try {
    // Free, or left by a run that died.
    await Setting.findOneAndUpdate({ key: LOCK, $or: [{ "value.at": null }, { "value.at": { $lt: new Date(now - 10 * 60000) } }] }, { $set: { value: { at: now } } }, { upsert: true });
  } catch (err) {
    if (err?.code === 11000) throw new ImportError("import_running");
    throw err;
  }
  try {
    return await work();
  } finally {
    await Setting.updateOne({ key: LOCK }, { $set: { value: { at: null } } }).catch(() => {});
  }
}

export async function applySync(data, user, people, digest, file) {
  return locked(async () => {
    const sync = await buildSync(data, user, people);
    if (sync.digest !== digest) throw new ImportError("import_changed");
    if (syncIsEmpty(sync)) throw new ImportError("import_nothing");
    const now = new Date();
    // Numbers first: the counter isn't part of the transaction.
    for (const d of [...sync.added, ...sync.redos]) d.number = await nextNumber("task");
    const before = [...sync.changed, ...sync.replaced].map((x) => x.here);
    const newTasks = await rawDocs(Task, [...sync.added, ...sync.redos.map((r) => ({ ...r, createdAt: now, updatedAt: now }))]);
    const stamp = (x) => ({ ...x, createdAt: now, updatedAt: now });
    const newDepartments = await rawDocs(Department, sync.newDepartments.map(stamp));
    const newUsers = await rawDocs(User, sync.newUsers.map(stamp));
    const newProjects = await rawDocs(WorkProject, sync.newProjects.map((p) => ({ ...p, createdAt: p.startDate || now, updatedAt: now })));
    const summary = { added: sync.added.length + sync.replaced.length, changed: sync.changed.length, redos: sync.redos.length, projects: newProjects.length, people: newUsers.length, conflicts: sync.conflicts.length };

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const put = async (Model, docs) => docs.length && Model.collection.insertMany(docs, { session });
        await put(Department, newDepartments);
        await put(User, newUsers);
        await put(WorkProject, newProjects);
        for (const u of sync.projectUpdates) {
          await WorkProject.updateOne(
            { _id: u._id },
            {
              ...(u.addStages.length ? { $push: { stages: { $each: u.addStages } } } : {}),
              $addToSet: { participants: { $each: u.participants } },
              ...(u.reopen ? { $set: { status: "active", finishedAt: null } } : {}),
            },
            { session }
          );
        }
        await put(Task, newTasks);
        // Still exactly as the preview saw it (nobody worked on it meanwhile).
        const follow = async (here, set) => {
          const r = await Task.updateOne({ _id: here._id, updatedAt: here.updatedAt }, { $set: set }, { session, timestamps: false });
          if (!r.matchedCount) throw new ImportError("import_changed");
        };
        for (const { doc, here } of sync.changed) {
          const set = Object.fromEntries(FOLLOWED.filter((k) => doc[k] !== undefined).map((k) => [k, doc[k]]));
          await follow(here, { ...set, updatedAt: now });
        }
        for (const { doc, here } of sync.replaced) {
          const { _id, number, ...set } = doc;
          await follow(here, { ...set, updatedAt: now });
        }
        await LegacyImport.create([{ by: user.id, at: now, fileName: file.name, fileHash: file.hash, rows: sync.rows, maxId: sync.maxId, summary, created: newTasks.map((t) => t._id), createdProjects: newProjects.map((p) => p._id), createdUsers: newUsers.map((u) => u._id), before }], { session });
      });
    } finally {
      await session.endSession();
    }
    await audit(user, "legacy.imported", { entityType: "legacyImport", entityId: file.hash.slice(0, 24), summary: `${file.name}: +${summary.added}, ~${summary.changed}` });
    await publish([COMPANY_TASKS_CHANNEL], "task:updated", { id: "legacy-import" }).catch(() => {});
    return summary;
  });
}

export async function importHistory() {
  const list = await LegacyImport.find({}, { before: 0, created: 0, createdProjects: 0, createdUsers: 0 }).sort({ at: -1 }).limit(20).lean();
  const people = await User.find({ _id: { $in: list.map((x) => x.by) } }, NAME_FIELDS).lean();
  const lang = await viewerLang();
  const names = Object.fromEntries(people.map((p) => [S(p._id), pickName(p, lang)]));
  return list.map((x) => ({ id: S(x._id), at: x.at, by: names[S(x.by)] || "", fileName: x.fileName, summary: x.summary }));
}

