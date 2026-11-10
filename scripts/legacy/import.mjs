// Legacy import, step 2: puts the old Excel / Access data (exported by export-access.ps1)
// into the system's database. See scripts/legacy/README.md.
//
//   node --experimental-detect-module --import ./scripts/legacy/register.mjs --env-file=.env scripts/legacy/import.mjs [options]
//
//   (no option)          dry run: reads the database, prints and saves what it would do
//   --apply              really writes
//   --undo               removes everything an earlier --apply added
//   --actor=<email>      who the imported records are "by" (default: the CEO account)
//   --renumber           give imported tasks new numbers if the old ones are taken
//   --no-create          don't create inactive accounts for people who aren't in the system
//   --kpi-include-current  also import the Excel KPI of the current month
//   --offline            no database at all (tests the mapping against an empty system)
//   --data=<dir>         where the exported JSON is (default scripts/legacy/data)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { buildPlan } from "./mapping.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  })
);
const dataDir = path.resolve(args.data || path.join(here, "data"));
const APPLY = Boolean(args.apply);
const log = (...x) => console.log(...x);

function load(name) {
  const file = path.join(dataDir, name);
  if (!fs.existsSync(file)) {
    if (name.startsWith("workbook.")) return [];
    throw new Error(`Missing ${file} — run scripts/legacy/export-access.ps1 first`);
  }
  const v = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
  return Array.isArray(v) ? v : [v];
}

const data = {
  tasks: load("tasks.Tasks_Records.json"),
  registry: load("tasks.Project_Status_Registry.json"),
  rawLogs: load("attendance.RawLogs.json"),
  overrides: load("attendance.tbl_ManualOverrides.json"),
  kpiArchive: load("attendance.tbl_KPI_Archive.json"),
  employees: load("workbook.employees.json"),
};
const peopleFile = path.join(here, "people.json");
const peopleMap = fs.existsSync(peopleFile) ? JSON.parse(fs.readFileSync(peopleFile, "utf8")) : {};
const newId = () => new mongoose.Types.ObjectId();

function todayIn(tz) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

// ---------- offline: an empty system ----------
if (args.offline) {
  const { SETTINGS_DEFAULTS } = await import("../../lib/settingsDefaults.js");
  const actorId = newId();
  const plan = buildPlan(data, {
    users: [],
    departments: [],
    projects: [],
    templates: [],
    settings: SETTINGS_DEFAULTS,
    existingNumbers: new Set(),
    existingLegacyIds: new Set(),
    existingLegacyRedos: new Set(),
    actorId: actorId.toString(),
    newId,
    tz: SETTINGS_DEFAULTS.hr.timezone,
    today: todayIn(SETTINGS_DEFAULTS.hr.timezone),
    peopleMap,
    createMissing: !args["no-create"],
    renumber: Boolean(args.renumber),
    nextNumber: 0,
    kpiIncludeCurrent: Boolean(args["kpi-include-current"]),
  });
  printReport(plan);
  fs.writeFileSync(path.join(dataDir, "plan.offline.json"), JSON.stringify(plan, null, 1));
  log(`\nFull plan: ${path.join(dataDir, "plan.offline.json")}`);
  process.exit(plan.report.fatal ? 1 : 0);
}

// ---------- with the database ----------
const { connectScriptDB } = await import("../connect.mjs");
const { getSettings } = await import("@/lib/settings");
const { default: User } = await import("@/models/User");
const { default: Department } = await import("@/models/Department");
const { default: WorkProject } = await import("@/models/WorkProject");
const { default: ProjectTemplate } = await import("@/models/ProjectTemplate");
const { default: Task } = await import("@/models/Task");
const { default: Counter } = await import("@/models/Counter");
const { default: RawPunch } = await import("@/models/RawPunch");
const { default: AttendanceOverride } = await import("@/models/AttendanceOverride");
const { default: KpiResult } = await import("@/models/KpiResult");

await connectScriptDB(log);
log(`Database: ${mongoose.connection.db.databaseName}`);

if (args.undo) {
  await undo();
  await mongoose.disconnect();
  process.exit(0);
}

const settings = await getSettings();
const tz = settings.hr?.timezone || "Asia/Damascus";
const users = await User.find({}, { email: 1, name: 1, nameAr: 1, firstName: 1, lastName: 1, role: 1, department: 1, managedDepartments: 1, badgeId: 1, status: 1 }).lean();
const actor =
  (args.actor && users.find((u) => u.email === String(args.actor).toLowerCase())) ||
  users.find((u) => u.role === "ceo" && u.status === "active") ||
  users.find((u) => u.role === "gm" && u.status === "active");
if (!actor) throw new Error(args.actor ? `No account ${args.actor}` : "No CEO / GM account found: pass --actor=<email>");
log(`Imported records are by: ${actor.email}`);

const [departments, projects, templates, numbers, legacyIds, legacyRedos, counter] = await Promise.all([
  Department.find().lean(),
  WorkProject.find({}, { name: 1, code: 1, department: 1, stages: 1, overrides: 1, legacyKey: 1 }).lean(),
  ProjectTemplate.find().lean(),
  Task.distinct("number", { "legacy.source": { $ne: "excel" } }),
  Task.distinct("legacy.id", { "legacy.source": "excel" }),
  Task.distinct("legacy.id", { "legacy.source": "excel-redo" }),
  Counter.findOne({ key: "task" }).lean(),
]);
const plan = buildPlan(data, {
  users,
  departments,
  projects,
  templates,
  settings,
  existingNumbers: new Set(numbers),
  existingLegacyIds: new Set(legacyIds),
  existingLegacyRedos: new Set(legacyRedos),
  actorId: actor._id.toString(),
  newId,
  tz,
  today: todayIn(tz),
  peopleMap,
  createMissing: !args["no-create"],
  renumber: Boolean(args.renumber),
  nextNumber: Math.max(counter?.seq || 0, ...numbers, 0),
  kpiIncludeCurrent: Boolean(args["kpi-include-current"]),
});
printReport(plan);
fs.writeFileSync(path.join(dataDir, "plan.json"), JSON.stringify(plan, null, 1));
log(`\nFull plan: ${path.join(dataDir, "plan.json")}`);

if (plan.report.fatal) {
  log(`\nSTOPPED: ${plan.report.fatal}`);
  await mongoose.disconnect();
  process.exit(1);
}
if (!APPLY) {
  log("\nDry run — nothing was written. Check the report, then run again with --apply.");
  await mongoose.disconnect();
  process.exit(0);
}

await apply(plan);
await mongoose.disconnect();

// ---------- writing ----------

// Validates through the model (defaults, types) but keeps the old dates as given.
async function rawDocs(Model, docs) {
  const out = [];
  for (const d of docs) {
    const m = new Model(d);
    try {
      await m.validate();
    } catch (err) {
      throw new Error(`${Model.modelName} ${d.legacy?.id ?? d.name?.ar ?? d.email ?? ""}: ${err.message}`);
    }
    out.push(m.toObject({ depopulate: true }));
  }
  return out;
}
async function insertAll(Model, docs, label) {
  if (!docs.length) return 0;
  let n = 0;
  for (let i = 0; i < docs.length; i += 500) {
    const res = await Model.collection.insertMany(await rawDocs(Model, docs.slice(i, i + 500)), { ordered: true });
    n += res.insertedCount;
  }
  log(`  ${label}: ${n}`);
  return n;
}

async function apply(p) {
  log("\nWriting…");
  await insertAll(Department, p.newDepartments.map((d) => ({ ...d, createdAt: new Date(), updatedAt: new Date() })), "departments");
  await insertAll(User, p.newUsers.map((u) => ({ ...u, createdAt: new Date(), updatedAt: new Date() })), "inactive accounts");
  for (const u of p.userUpdates) await User.updateOne({ _id: u._id }, { $set: u.set });
  if (p.userUpdates.length) log(`  fingerprint IDs set: ${p.userUpdates.length}`);

  await insertAll(WorkProject, p.newProjects.map((x) => ({ ...x, createdAt: x.startDate || new Date(), updatedAt: new Date() })), "projects");
  for (const u of p.projectUpdates) {
    await WorkProject.updateOne(
      { _id: u._id },
      { $push: { stages: { $each: u.addStages }, overrides: { $each: u.addOverrides } }, $addToSet: { participants: { $each: u.participants } } }
    );
  }
  if (p.projectUpdates.length) log(`  existing projects given stages / people: ${p.projectUpdates.length}`);

  await insertAll(Task, p.tasks, "tasks");
  await insertAll(Task, p.redos.map((t) => ({ ...t, createdAt: new Date(), updatedAt: new Date() })), "redos waiting (R+1)");
  const top = Math.max(0, ...p.tasks.map((t) => t.number), ...p.redos.map((t) => t.number));
  if (top) await Counter.updateOne({ key: "task" }, { $max: { seq: top } }, { upsert: true });

  let punches = 0;
  for (let i = 0; i < p.punches.length; i += 1000) {
    try {
      punches += (await RawPunch.collection.insertMany(await rawDocs(RawPunch, p.punches.slice(i, i + 1000).map((x) => ({ ...x, createdAt: new Date() }))), { ordered: false })).insertedCount;
    } catch (err) {
      // Punches the fingerprint agent already sent are skipped (same person, same second).
      if (err.code !== 11000 && !err.writeErrors) throw err;
      punches += err.result?.insertedCount ?? err.insertedCount ?? 0;
    }
  }
  log(`  fingerprint punches: ${punches} new (${p.punches.length - punches} were already there)`);

  if (p.overrides.length) {
    // Straight to the collection (Mongoose would add its own timestamps to the update):
    // a day HR already corrected in the new system is left exactly as it is.
    const oid = (v) => (v ? new mongoose.Types.ObjectId(String(v)) : null);
    const now = new Date();
    const res = await AttendanceOverride.collection.bulkWrite(
      p.overrides.map((o) => ({
        updateOne: {
          filter: { user: oid(o.user), date: o.date },
          update: { $setOnInsert: { ...o, user: oid(o.user), by: oid(o.by), createdAt: now, updatedAt: now } },
          upsert: true,
        },
      }))
    );
    log(`  attendance corrections: ${res.upsertedCount} new (${p.overrides.length - res.upsertedCount} days HR had already corrected here)`);
  }

  let kpi = 0;
  for (const k of p.kpi) {
    const existing = await KpiResult.findOne({ user: k.user, month: k.month }, { legacy: 1 }).lean();
    if (existing && !existing.legacy) continue; // a month closed in the new system keeps its result
    // Without _id: on a re-run the stored document keeps its own.
    const { _id, ...doc } = (await rawDocs(KpiResult, [{ ...k, createdAt: new Date(), updatedAt: new Date() }]))[0];
    await KpiResult.collection.replaceOne({ user: doc.user, month: doc.month }, doc, { upsert: true });
    kpi += 1;
  }
  log(`  KPI results (Excel archive): ${kpi}`);
  log("\nDone. Restart `next dev` so it loads the updated models.");
}

async function undo() {
  log("Removing what the legacy import added…");
  const created = await WorkProject.find({ legacyKey: /^excel:/ }, { _id: 1 }).lean();
  const ids = created.map((x) => x._id);
  const r = {
    tasks: (await Task.deleteMany({ "legacy.source": { $in: ["excel", "excel-redo"] } })).deletedCount,
    projects: (await WorkProject.deleteMany({ _id: { $in: ids } })).deletedCount,
    punches: (await RawPunch.deleteMany({ note: "Excel" })).deletedCount,
    overrides: (await AttendanceOverride.deleteMany({ note: /^Excel:/ })).deletedCount,
    kpi: (await KpiResult.deleteMany({ legacy: true })).deletedCount,
    accounts: (await User.deleteMany({ email: /@octo-builders\.invalid$/, lastLoginAt: { $exists: false } })).deletedCount,
  };
  for (const [k, v] of Object.entries(r)) log(`  ${k}: ${v}`);
  log("Stages added to projects that already existed, and fingerprint IDs set on accounts, are left in place.");
}

// ---------- report ----------
function printReport({ report }) {
  log("\n=== People ===");
  for (const p of report.people) log(`  ${p.name.padEnd(18)} → ${p.account}${p.badge ? `  (fingerprint ${p.badge})` : ""}${p.spellings.length > 1 ? `  [also: ${p.spellings.filter((s) => s !== p.name).join(", ")}]` : ""}`);
  log("\n=== Projects ===");
  for (const p of report.projects) log(`  ${p.existing ? "existing" : "new     "} ${p.department}  ${p.status.padEnd(9)} ${p.name}`);
  log("\n=== Counts ===");
  for (const [k, v] of Object.entries(report.counts)) log(`  ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
  if (report.warnings.length) {
    log("\n=== Warnings ===");
    for (const w of [...new Set(report.warnings)]) log(`  - ${w}`);
  }
  if (report.skipped.length) {
    log(`\n=== Skipped rows (${report.skipped.length}) ===`);
    for (const s of report.skipped.slice(0, 30)) log(`  - ${JSON.stringify(s)}`);
  }
  if (report.fatal) log(`\n!!! ${report.fatal}`);
}
