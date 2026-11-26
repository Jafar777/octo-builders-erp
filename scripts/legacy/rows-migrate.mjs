// One-off: projects whose work repeats over spaces / sheets (lib/projectRows.js).
//
//   node --experimental-detect-module --import ./scripts/legacy/register.mjs --env-file=.env scripts/legacy/rows-migrate.mjs           (dry run)
//   … rows-migrate.mjs --access=/path/rows-access.json --apply
//
// 1. The interior design template repeats over spaces, the technical office's over sheets.
// 2. The interior projects get their spaces from their tasks' titles ("GF-06-BATHROOM")
//    and the old Access sheet; each task is linked to its space. Skips from Access and
//    whole-stage Skip / Done become each space's own.
// 3. Their technical-office stage (to_shop_drawings) becomes a technical-office project of
//    its own, with one sheet per drawing number, linked back to the interior project.
import { readFileSync } from "node:fs";
import mongoose from "mongoose";
import { connectScriptDB } from "../connect.mjs";

const { default: WorkProject } = await import("@/models/WorkProject");
const { default: ProjectTemplate } = await import("@/models/ProjectTemplate");
const { default: Task } = await import("@/models/Task");
const { default: WorkRequest } = await import("@/models/WorkRequest");
const { default: ProjectFile } = await import("@/models/ProjectFile");
const { compareRows, rowKey, rowLabel } = await import("@/lib/projectRows");

const APPLY = process.argv.includes("--apply");
const log = console.log;
const ID_TEMPLATE = "6abd2c1c3879e7f4e42b808c"; // التصميم الداخلي — فراغات
const TO_TEMPLATE = "6abd2c1c3879e7f4e42b808e"; // المكتب الفني — مخططات
const TO_DEPARTMENT = "6abd188a3879e7f4e42b8081"; // المكتب الفني
const PROJECTS = {
  "6af307be84cee3b989955c30": "فيلا وسيم الحربي",
  "6af307be84cee3b989955c34": "فيلا أبو جمال",
  "6af307be84cee3b989955c36": "M7+M8 مكعب الماسية - مجمع النهضة",
  "6af307be84cee3b989955c37": "مكعب الماسية - M9",
};
const EVERY_ROW = ["cad", "max", "test_render", "final_render", "shop_drawing"];
const TECH_STAGE = "to_shop_drawings";
// The old Access sheet's spaces and Skips ({ skips: [{ project, stage, scope }], scopes:
// [[project, scope]] }, exported from Project_Status_Registry): kept out of the repository,
// given as --access=<file>.
const accessFile = (process.argv.find((a) => a.startsWith("--access=")) || "").slice(9);
const access = accessFile ? JSON.parse(readFileSync(accessFile, "utf8")) : { skips: [], scopes: [] };

// "GF-06-BATHROOM", "FF-09**BEDROOM", "GF -07- LOBBY" → a space; "MASTER … PLAN" → a space
// without a code; anything else (OTHER, Presentation, Checking…) is whole-project work.
function spaceOf(title) {
  const text = String(title || "").replace(/\s+/g, " ").trim();
  const m = text.match(/^([A-Za-z]{1,3})\s*-\s*(\d{1,3})(\**)\s*-?\s*([A-Za-z].*)$/);
  if (m) return { number: `${m[1].toUpperCase()}-${m[2].padStart(2, "0")}${m[3]}`, name: m[4].trim() };
  if (/^MASTER\s/i.test(text)) return { number: "", name: text.toUpperCase() };
  return null;
}
// "AR-605", "AR -005", "ELEC-101" → a sheet; Checking, BOQ… → whole-project work.
function sheetOf(title) {
  const m = String(title || "").trim().match(/^([A-Za-z]{1,4})\s*-\s*(\d{1,4}(?:-[A-Za-z0-9]{1,3})?)$/);
  return m ? { number: `${m[1].toUpperCase()}-${m[2].toUpperCase()}`, name: "" } : null;
}

// Rows from titles, sorted, with ids; `find(title)` → the row or null.
function rowsFrom(titles, parse, existing = []) {
  const byKey = new Map(existing.map((r) => [rowKey(r), r]));
  for (const t of titles) {
    const row = parse(t);
    if (row && !byKey.has(rowKey(row))) byKey.set(rowKey(row), { ...row, _id: new mongoose.Types.ObjectId(), space: null, archived: false });
  }
  const items = [...byKey.values()].sort(compareRows).map((r, order) => ({ ...r, order }));
  const keyed = new Map(items.map((r) => [rowKey(r), r]));
  return { items, find: (t) => (parse(t) ? keyed.get(rowKey(parse(t))) || null : null) };
}

await connectScriptDB(log);
log(APPLY ? "APPLYING" : "DRY RUN (add --apply to write)");
const summary = [];

// 1. Templates.
const idTpl = await ProjectTemplate.findById(ID_TEMPLATE);
const toTpl = await ProjectTemplate.findById(TO_TEMPLATE);
if (!idTpl || !toTpl) throw new Error("templates not found");
log(`template ${idTpl.name.ar}: rows ${idTpl.rows || "-"} → spaces; ${toTpl.name.ar}: rows ${toTpl.rows || "-"} → sheets`);
if (APPLY) {
  idTpl.rows = "spaces";
  toTpl.rows = "sheets";
  await idTpl.save();
  await toTpl.save();
}

const touched = [];
for (const [pid, accessName] of Object.entries(PROJECTS)) {
  const project = await WorkProject.findById(pid);
  if (!project) {
    log(`! ${pid} missing`);
    continue;
  }
  if (project.rows) {
    log(`= ${project.name.ar}: already has rows (${project.rows}), skipped`);
    continue;
  }
  const tasks = await Task.find({ project: project._id, stage: { $ne: "" } });
  const own = tasks.filter((t) => t.stage !== TECH_STAGE);
  const tech = tasks.filter((t) => t.stage === TECH_STAGE);

  // 2. Spaces: from the tasks and from Access's list for this project.
  const scopes = access.scopes.filter(([p]) => p === accessName).map(([, s]) => s);
  const spaces = rowsFrom([...own.map((t) => t.title), ...scopes], spaceOf);
  const linked = own.filter((t) => spaces.find(t.title));
  const whole = own.filter((t) => !spaces.find(t.title));
  log(`\n${project.name.ar}: ${spaces.items.length} spaces · ${linked.length} tasks linked to one · ${whole.length} whole-project (${[...new Set(whole.map((t) => t.title || "—"))].join(", ")})`);

  // Manual states: Access skips per space; a whole-stage Skip / Done on a stage worked in
  // every space applies to every space.
  const overrides = [];
  const has = new Set();
  const add = (o) => {
    const k = `${o.item || ""}|${o.stage}`;
    if (has.has(k)) return;
    has.add(k);
    overrides.push(o);
  };
  for (const o of project.overrides || []) {
    if (EVERY_ROW.includes(o.stage) && !o.item) for (const r of spaces.items) add({ item: r._id, stage: o.stage, status: o.status, reason: o.reason, by: o.by, at: o.at });
    else if (o.stage !== TECH_STAGE) add(o.toObject());
  }
  let fromAccess = 0;
  for (const s of access.skips.filter((x) => x.project === accessName)) {
    const row = spaces.find(s.scope);
    if (!row || !project.stages.some((st) => st.key === s.stage)) continue;
    const before = overrides.length;
    add({ item: row._id, stage: s.stage, status: "skip", reason: "Skip (Access)", by: null, at: new Date() });
    fromAccess += overrides.length - before;
  }
  log(`  manual states: ${(project.overrides || []).length} → ${overrides.length} (${fromAccess} skips from Access)`);

  // 3. The technical office's part, as its own project.
  let techProject = null;
  if (tech.length) {
    const sheets = rowsFrom(tech.map((t) => t.title), sheetOf);
    const techWhole = tech.filter((t) => !sheets.find(t.title));
    log(`  technical office: ${tech.length} tasks → new project with ${sheets.items.length} sheets (${sheets.items.map((r) => r.number).join(" ")}); whole-project: ${[...new Set(techWhole.map((t) => t.title))].join(", ")}`);
    const stage = toTpl.stages[0].toObject();
    if (APPLY) {
      techProject = await WorkProject.create({
        code: project.code ? `${project.code}-TO` : "",
        name: { ar: `المكتب الفني - ${project.name.ar}`, en: `Technical Office - ${project.name.en || project.name.ar}` },
        client: project.client,
        customer: project.customer,
        department: TO_DEPARTMENT,
        branch: project.branch,
        manager: null,
        participants: project.participants,
        status: project.status,
        priority: project.priority,
        flow: "mixed",
        startDate: project.startDate,
        dueDate: project.dueDate,
        baselineDueDate: project.baselineDueDate,
        folderLink: project.folderLink,
        serverFolder: project.serverFolder,
        stages: [{ ...stage, department: null, after: [], waitForPrevious: false }],
        rows: "sheets",
        linkedProject: project._id,
        items: sheets.items,
        overrides: [],
        createdBy: project.createdBy,
      });
      for (const t of tech) {
        const row = sheets.find(t.title);
        await Task.updateOne(
          { _id: t._id },
          { $set: { project: techProject._id, stage: stage.key, item: row?._id || null, department: TO_DEPARTMENT, ...(row ? { title: rowLabel(row) } : {}) } }
        );
      }
      await WorkRequest.updateMany({ project: project._id, stage: TECH_STAGE }, { $set: { project: techProject._id, stage: stage.key } });
      await ProjectFile.updateMany({ project: project._id, stage: TECH_STAGE }, { $set: { project: techProject._id, stage: stage.key } });
      touched.push(techProject._id);
    }
  }

  // The interior project itself.
  if (APPLY) {
    for (const t of linked) {
      const row = spaces.find(t.title);
      await Task.updateOne({ _id: t._id }, { $set: { item: row._id, title: rowLabel(row) } });
    }
    project.rows = "spaces";
    project.items = spaces.items;
    project.overrides = overrides;
    project.stages = project.stages
      .filter((s) => s.key !== TECH_STAGE)
      .map((s) => {
        const o = s.toObject();
        return { ...o, after: (o.after || []).filter((k) => k !== TECH_STAGE), optional: !EVERY_ROW.includes(o.key) };
      });
    project.handedOff = (project.handedOff || []).filter((k) => k !== TECH_STAGE);
    await project.save();
    touched.push(project._id);
  }
  summary.push(project.name.ar);
}

// Each task waits for its own space's earlier stages now (not for the whole stage).
if (APPLY) {
  const { syncStageDependencies } = await import("@/lib/taskSchedule");
  const { getWorkCalendar } = await import("@/lib/ganttServer");
  const { boardState } = await import("@/lib/projects");
  const { stageAfter } = await import("@/lib/stageFlow");
  const cal = await getWorkCalendar();
  for (const id of touched) {
    const p = await WorkProject.findById(id).lean();
    const changed = await syncStageDependencies(p, cal, null);
    // Stages open now count as already announced: they were ready before, only the
    // board's shape changed (nobody gets a "ready for you" for them).
    const { locked } = await boardState(p);
    const ready = p.stages.filter((s, i) => stageAfter(p.stages, i).length && !locked.includes(s.key)).map((s) => s.key);
    await WorkProject.updateOne({ _id: id }, { $set: { handedOff: ready } });
    log(`  ${p.name.ar}: ${changed.length} waiting tasks re-linked`);
  }
}
log(`\ndone: ${summary.join(" · ")}`);
await mongoose.disconnect();
process.exit(0);
