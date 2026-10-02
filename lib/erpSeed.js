import User from "@/models/User";
import Role from "@/models/Role";
import Department from "@/models/Department";
import Branch from "@/models/Branch";
import JobTitle from "@/models/JobTitle";
import Setting from "@/models/Setting";
import ProjectTemplate from "@/models/ProjectTemplate";
import { DEFAULT_ROLES, PERMISSION_KEYS, SYSTEM_ROLES } from "@/lib/permissions";

const SEED_KEY = "_erp_seed_v1";
const SEED_V2_KEY = "_erp_seed_v2_tasks";

// Permissions added in v2 (projects & tasks) are granted to existing default roles once.
const V2_PERMISSIONS = ["projects.view", "projects.manage", "tasks.assign", "tasks.review"];
const SEED_V3_KEY = "_erp_seed_v3_hr";
const SEED_V4_KEY = "_erp_seed_v4_finance";
const V4_PERMISSIONS = ["finance.view", "finance.manage", "pricing.use"];
// HR, KPI and analytics permissions (v3).
const V3_PERMISSIONS = [
  "attendance.view",
  "attendance.manage",
  "leave.approve",
  "payroll.view",
  "payroll.manage",
  "kpi.view",
  "kpi.manage",
  "analytics.view",
];

// Board templates from the Excel department sections.
const TEMPLATES = [
  {
    department: "ID",
    name: { ar: "التصميم الداخلي — فراغات", en: "Interior design — spaces" },
    stages: [
      { key: "cad", name: { ar: "CAD", en: "CAD" }, taskType: "cad" },
      { key: "max", name: { ar: "MAX", en: "MAX" }, taskType: "max" },
      { key: "test_render", name: { ar: "TEST RENDER", en: "TEST RENDER" }, taskType: "test_render" },
      { key: "final_render", name: { ar: "FINAL RENDER", en: "FINAL RENDER" }, taskType: "final_render" },
      { key: "shop_drawing", name: { ar: "SHOPDRAWING", en: "SHOPDRAWING" }, taskType: "shop_drawings" },
    ],
    items: ["MASTER ARCHITECTURE PLAN", "MASTER CEILING PLAN", "MASTER FLOORING PLAN", "MASTER BLOCK PLAN"],
  },
  {
    department: "RD",
    name: { ar: "المطورين العقاريين — 8 مراحل", en: "Real-estate developers — 8 stages" },
    stages: [
      { key: "arch_design", name: { ar: "تصميم معماري", en: "Architectural design" }, taskType: "cad" },
      { key: "arch_structural", name: { ar: "تحديث المعماري على الانشائي", en: "Architecture vs structural update" }, taskType: "cad" },
      { key: "arch_mep", name: { ar: "تحديث المعماري على MEP", en: "Architecture vs MEP update" }, taskType: "cad" },
      { key: "massing", name: { ar: "رفع الكتلة المعمارية", en: "Architectural massing" }, taskType: "max" },
      { key: "facades", name: { ar: "تصميم الواجهات الخارجية", en: "Exterior facades design" }, taskType: "max" },
      { key: "test_render", name: { ar: "TEST RENDER", en: "TEST RENDER" }, taskType: "test_render" },
      { key: "final_render", name: { ar: "FINAL RENDER", en: "FINAL RENDER" }, taskType: "final_render" },
      { key: "shop_drawings", name: { ar: "SHOPDRAWINGS", en: "SHOPDRAWINGS" }, taskType: "shop_drawings" },
    ],
    items: ["المشروع / Project"],
  },
  {
    department: "TO",
    name: { ar: "المكتب الفني — مخططات", en: "Technical office — drawings" },
    stages: [{ key: "shop_drawings", name: { ar: "ShopDrawings", en: "ShopDrawings" }, taskType: "shop_drawings" }],
    items: [],
  },
];

const DEPARTMENTS = [
  { code: "ID", name: { ar: "التصميم الداخلي", en: "Interior Design" }, color: "#f37b20" },
  { code: "RD", name: { ar: "المطورين العقاريين", en: "Real-Estate Developers" }, color: "#38bdf8" },
  { code: "TO", name: { ar: "المكتب الفني", en: "Technical Office" }, color: "#a78bfa" },
  { code: "SM", name: { ar: "سوشال ميديا", en: "Social Media" }, color: "#f472b6" },
  { code: "AD", name: { ar: "الإدارة", en: "Administration" }, color: "#94a3b8" },
];

const BRANCHES = [
  { code: "DAM", name: { ar: "دمشق", en: "Damascus" }, currency: "USD", timezone: "Asia/Damascus" },
  { code: "JED", name: { ar: "جدة", en: "Jeddah" }, currency: "SAR", timezone: "Asia/Riyadh" },
];

const JOB_TITLES = [
  { ar: "مهندس معماري", en: "Architect" },
  { ar: "مصمم داخلي", en: "Interior Designer" },
  { ar: "مهندس مكتب فني", en: "Technical Office Engineer" },
  { ar: "مصمم رندر", en: "Render Artist" },
  { ar: "منسق", en: "Coordinator" },
  { ar: "محاسب", en: "Accountant" },
];

let seeding = null;

// Idempotent setup of everything the ERP needs to exist. Runs once per server
// process; the marker keeps the one-time parts (departments, branches...) from
// running again after an admin has edited or deleted them.
export function ensureErpSeeded() {
  if (!seeding) {
    seeding = runSeed().catch((err) => {
      seeding = null;
      throw err;
    });
  }
  return seeding;
}

async function runSeed() {
  // Roles: create missing defaults; the GM role always keeps every permission.
  const existing = new Set((await Role.find({}, { key: 1 }).lean()).map((r) => r.key));
  const missing = DEFAULT_ROLES.filter((r) => !existing.has(r.key)).map((r) => ({
    ...r,
    system: SYSTEM_ROLES.includes(r.key),
  }));
  if (missing.length) await Role.insertMany(missing, { ordered: false }).catch(() => {});
  await Role.updateOne({ key: "gm" }, { $set: { permissions: PERMISSION_KEYS, scope: "all", system: true } });

  // Accounts from before the role system.
  await User.updateMany({ role: "admin" }, { $set: { role: "gm" } });

  await runSeedV1();
  await runSeedV2();
  await grantOnce(SEED_V3_KEY, V3_PERMISSIONS);
  await grantOnce(SEED_V4_KEY, V4_PERMISSIONS);
}

// Grants newly introduced permissions to the default roles exactly once, so later
// edits by the GM are never overwritten.
async function grantOnce(markerKey, permissions) {
  const marker = await Setting.findOneAndUpdate(
    { key: markerKey },
    { $setOnInsert: { key: markerKey, value: { at: new Date() } } },
    { upsert: true, includeResultMetadata: true }
  );
  if (marker.lastErrorObject?.updatedExisting) return;
  for (const role of DEFAULT_ROLES) {
    const added = role.permissions.filter((p) => permissions.includes(p));
    if (added.length) await Role.updateOne({ key: role.key }, { $addToSet: { permissions: { $each: added } } });
  }
}

async function runSeedV1() {
  const marker = await Setting.findOneAndUpdate(
    { key: SEED_KEY },
    { $setOnInsert: { key: SEED_KEY, value: { at: new Date() } } },
    { upsert: true, includeResultMetadata: true }
  );
  if (marker.lastErrorObject?.updatedExisting) return;

  if ((await Department.countDocuments()) === 0) {
    await Department.insertMany(DEPARTMENTS.map((d, order) => ({ ...d, order })));
  }
  if ((await Branch.countDocuments()) === 0) await Branch.insertMany(BRANCHES);
  if ((await JobTitle.countDocuments()) === 0) {
    await JobTitle.insertMany(JOB_TITLES.map((name) => ({ name })));
  }
}

async function runSeedV2() {
  const marker = await Setting.findOneAndUpdate(
    { key: SEED_V2_KEY },
    { $setOnInsert: { key: SEED_V2_KEY, value: { at: new Date() } } },
    { upsert: true, includeResultMetadata: true }
  );
  if (marker.lastErrorObject?.updatedExisting) return;

  for (const role of DEFAULT_ROLES) {
    const added = role.permissions.filter((p) => V2_PERMISSIONS.includes(p));
    if (added.length) await Role.updateOne({ key: role.key }, { $addToSet: { permissions: { $each: added } } });
  }

  if ((await ProjectTemplate.countDocuments()) === 0) {
    const departments = await Department.find({}, { code: 1 }).lean();
    const byCode = Object.fromEntries(departments.map((d) => [d.code, d._id]));
    await ProjectTemplate.insertMany(
      TEMPLATES.map(({ department, ...rest }) => ({ ...rest, department: byCode[department] || null }))
    );
  }
}
