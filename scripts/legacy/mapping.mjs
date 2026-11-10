// Legacy import, step 2a: turns the old program's tables (exported by export-access.ps1)
// into documents of the new system. Pure: no database. `buildPlan` gets what is in the
// database already (users, departments, projects, settings…) and returns what to create
// or change, with a report of everything it couldn't place.

import { SETTINGS_DEFAULTS } from "../../lib/settingsDefaults.js";
import { DEFAULT_KPI, indicatorWeight, itemWeight, kpiConfigFor } from "../../lib/kpi/config.js";

const HOUR = 3600000;
const DAY = 24 * HOUR;
const idStr = (v) => (v ? v.toString() : "");
const clean = (v) => {
  const s = String(v ?? "").trim();
  return !s || /^n[\\/]a$/i.test(s) ? "" : s;
};

// ---------- names ----------

// Arabic spelling variants (hamza, alef maqsura, ta marbuta, diacritics, spacing).
export function normalizeAr(s) {
  return String(s ?? "")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
// Looser: also ignores "ال" at the start of each word and the spaces ("غزل صالح" = "غزل الصالح").
export const looseAr = (s) =>
  normalizeAr(s)
    .split(" ")
    .map((w) => w.replace(/^ال(?=..)/, ""))
    .join("");

// ---------- time ----------

// The old program stored office (local) time without a zone.
function tzOffsetMs(ms, tz) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value])
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}
export function localDate(value, tz) {
  if (!value) return null;
  let iso = String(value).trim();
  // "5/3/2026 3:35:08 PM" (US format, from text columns)
  const us = iso.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if (us) {
    let h = Number(us[4] || 0);
    if (us[7]) h = (h % 12) + (us[7].toUpperCase() === "PM" ? 12 : 0);
    const pad = (n) => String(n).padStart(2, "0");
    iso = `${us[3]}-${pad(us[1])}-${pad(us[2])}T${pad(h)}:${us[5] || "00"}:${us[6] || "00"}`;
  }
  const naive = Date.parse(`${iso.slice(0, 19)}Z`);
  if (Number.isNaN(naive)) return null;
  let utc = naive - tzOffsetMs(naive, tz);
  utc = naive - tzOffsetMs(utc, tz); // right side of a DST change
  return new Date(utc);
}
// Excel serial day number (local time) → Date.
export function excelSerialDate(serial, tz) {
  const n = Number(serial);
  if (!Number.isFinite(n) || n < 30000) return null;
  return localDate(new Date(Math.round((n - 25569) * DAY)).toISOString().slice(0, 19), tz);
}
// "2 d 06:54" → ms; anything else → null.
export function parseDuration(s) {
  const m = String(s ?? "").trim().match(/^(\d+)\s*d\s*(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * DAY + Number(m[2]) * HOUR + Number(m[3]) * 60000 : null;
}
const revisionOf = (s) => {
  const m = String(s ?? "").match(/R-?(\d+)/i);
  return m ? Number(m[1]) : 0;
};

// ---------- departments, types, stages ----------

export function deptCodeOf(name) {
  const n = normalizeAr(name);
  if (!n) return "";
  if (n.includes("اجتماعات")) return "MEETING";
  if (n.includes("التصميم الداخلي")) return "ID";
  if (n.includes("المطورين")) return "RD";
  if (n.includes("المكتب الفني")) return "TO";
  return "";
}
const DEPT_NAMES = {
  ID: { ar: "التصميم الداخلي", en: "Interior Design" },
  RD: { ar: "المطورين العقاريين", en: "Real-Estate Developers" },
  TO: { ar: "المكتب الفني", en: "Technical Office" },
};

const TYPE_KEYS = {
  cad: "cad",
  max: "max",
  "test render": "test_render",
  "final render": "final_render",
  shopdrawings: "shop_drawings",
  "shop drawings": "shop_drawings",
  "graphics edit": "graphics_edit",
  "ai edit": "ai_edit",
  presentation: "presentation",
  animation: "animation",
  "site analysis": "site_analysis",
  bim: "bim",
};
export const typeKeyOf = (label) => TYPE_KEYS[String(label ?? "").trim().toLowerCase()] || "";

// The board stages of each department (as lib/erpSeed.js seeds the templates).
export const FALLBACK_TEMPLATES = {
  ID: [
    { key: "cad", name: { ar: "CAD", en: "CAD" }, taskType: "cad" },
    { key: "max", name: { ar: "MAX", en: "MAX" }, taskType: "max" },
    { key: "test_render", name: { ar: "TEST RENDER", en: "TEST RENDER" }, taskType: "test_render" },
    { key: "final_render", name: { ar: "FINAL RENDER", en: "FINAL RENDER" }, taskType: "final_render" },
    { key: "shop_drawing", name: { ar: "SHOPDRAWING", en: "SHOPDRAWING" }, taskType: "shop_drawings" },
  ],
  RD: [
    { key: "arch_design", name: { ar: "تصميم معماري", en: "Architectural design" }, taskType: "cad" },
    { key: "arch_structural", name: { ar: "تحديث المعماري على الانشائي", en: "Architecture vs structural update" }, taskType: "cad" },
    { key: "arch_mep", name: { ar: "تحديث المعماري على MEP", en: "Architecture vs MEP update" }, taskType: "cad" },
    { key: "massing", name: { ar: "رفع الكتلة المعمارية", en: "Architectural massing" }, taskType: "max" },
    { key: "facades", name: { ar: "تصميم الواجهات الخارجية", en: "Exterior facades design" }, taskType: "max" },
    { key: "test_render", name: { ar: "TEST RENDER", en: "TEST RENDER" }, taskType: "test_render" },
    { key: "final_render", name: { ar: "FINAL RENDER", en: "FINAL RENDER" }, taskType: "final_render" },
    { key: "shop_drawings", name: { ar: "SHOPDRAWINGS", en: "SHOPDRAWINGS" }, taskType: "shop_drawings" },
  ],
  TO: [{ key: "shop_drawings", name: { ar: "ShopDrawings", en: "ShopDrawings" }, taskType: "shop_drawings" }],
};
const ID_STAGE_BY_TYPE = { cad: "cad", max: "max", test_render: "test_render", final_render: "final_render", shop_drawings: "shop_drawing" };
const RD_STAGE_BY_SCOPE = Object.fromEntries(
  [
    ["تصميم معماري", "arch_design"],
    ["تحديث المعماري على الانشائي", "arch_structural"],
    ["تحديث المعماري على MEP", "arch_mep"],
    ["رفع الكتلة المعمارية", "massing"],
    ["تصميم الواجهات الخارجية", "facades"],
    ["TEST RENDER", "test_render"],
    ["FINAL RENDER", "final_render"],
    ["SHOPDRAWINGS", "shop_drawings"],
  ].map(([k, v]) => [normalizeAr(k), v])
);

// The stage (template key) of a piece of work, and what goes in the task's title (the
// former board row: the room for interior design, the drawing for the technical office).
function stageOf(code, typeKey, scope, typeLabel, templates) {
  const scopeText = clean(scope);
  if (code === "ID") return { stage: ID_STAGE_BY_TYPE[typeKey] || typeKey || "other", title: scopeText };
  if (code === "RD") {
    const stage = RD_STAGE_BY_SCOPE[normalizeAr(scopeText)] || ID_STAGE_BY_TYPE[typeKey]?.replace("shop_drawing", "shop_drawings") || typeKey || "other";
    const natural = (templates.RD || []).find((s) => s.key === stage)?.taskType;
    // Work of another kind inside the stage (AI edit on the facades…) keeps its kind in the title.
    return { stage, title: natural && typeKey && natural !== typeKey ? clean(typeLabel) : "" };
  }
  if (code === "TO") return { stage: "shop_drawings", title: scopeText };
  return { stage: typeKey || "other", title: scopeText };
}

const PROJECT_CODE = /^([A-Z]{1,3}\d+(?:\+[A-Z]{1,3}\d+)*)\b/;

// ---------- the plan ----------

/**
 * @param data  { tasks, registry, rawLogs, overrides, kpiArchive, employees } (exported rows)
 * @param ctx   { users, departments, projects, templates, settings, existingNumbers:Set,
 *                existingLegacyIds:Set, actorId, newId(), tz, today:"YYYY-MM-DD",
 *                peopleMap:{ name: email }, createMissing, renumber, nextNumber, kpiIncludeCurrent }
 */
export function buildPlan(data, ctx) {
  const { tz } = ctx;
  const report = { warnings: [], counts: {} };
  const warn = (msg) => report.warnings.push(msg);
  const taskSettings = { ...SETTINGS_DEFAULTS.tasks, ...(ctx.settings?.tasks || {}) };
  const typeKeys = new Set(taskSettings.taskTypes.map((t) => t.key));

  // ----- departments -----
  const deptByCode = {};
  const newDepartments = [];
  for (const code of ["ID", "RD", "TO"]) {
    const found =
      ctx.departments.find((d) => String(d.code || "").toUpperCase() === code) ||
      ctx.departments.find((d) => deptCodeOf(d.name?.ar) === code || looseAr(d.name?.ar) === looseAr(DEPT_NAMES[code].ar));
    if (found) deptByCode[code] = idStr(found._id);
    else {
      const doc = { _id: ctx.newId(), code, name: DEPT_NAMES[code], active: true };
      newDepartments.push(doc);
      deptByCode[code] = idStr(doc._id);
    }
  }
  const codeOfDept = Object.fromEntries(Object.entries(deptByCode).map(([c, id]) => [id, c]));
  const templates = { ...FALLBACK_TEMPLATES };
  for (const t of ctx.templates || []) {
    const code = codeOfDept[idStr(t.department)];
    if (code && t.stages?.length && FALLBACK_TEMPLATES[code].every((s) => t.stages.some((x) => x.key === s.key))) templates[code] = t.stages;
  }

  // ----- people -----
  const employees = data.employees || [];
  const people = {}; // looseAr(name) → { names:Set, user, create?, badgeId, codes }
  const personOf = (name) => {
    const n = clean(name);
    if (!n) return null;
    const key = looseAr(n);
    return (people[key] ||= { key, name: n, names: new Set(), codes: {}, refs: 0 });
  };
  const note = (name, code) => {
    const p = personOf(name);
    if (!p) return null;
    p.names.add(clean(name));
    p.refs += 1;
    if (code && code !== "MEETING") p.codes[code] = (p.codes[code] || 0) + 1;
    return p;
  };
  for (const e of employees) {
    const p = note(e.name);
    p.refs -= 1; // being on the employee list alone needs no account
    p.employee = e;
    p.name = e.name; // the workbook spelling wins
  }
  for (const r of data.tasks) note(r["المهندس"], deptCodeOf(r["القسم"]));
  for (const r of data.registry) note(r.Engineer_Name, deptCodeOf(r.Department));
  for (const r of data.overrides) note(r.EmpName);
  for (const r of data.kpiArchive) note(r.EmpName);

  const byEmail = Object.fromEntries(ctx.users.map((u) => [String(u.email).toLowerCase(), u]));
  const userKeys = (u) =>
    [u.nameAr, u.name, `${u.firstName?.ar || ""} ${u.lastName?.ar || ""}`, `${u.firstName?.en || ""} ${u.lastName?.en || ""}`].map(looseAr).filter((k) => k.length > 2);
  const userUpdates = [];
  const newUsers = [];
  const freeEmail = (local) => {
    let email = `${local}@octo-builders.invalid`;
    for (let i = 2; byEmail[email] || newUsers.some((u) => u.email === email); i++) email = `${local}.${i}@octo-builders.invalid`;
    return email;
  };
  const mapped = Object.fromEntries(Object.entries(ctx.peopleMap || {}).map(([k, v]) => [looseAr(k), String(v).toLowerCase()]));
  for (const p of Object.values(people)) {
    const badge = clean(p.employee?.badgeId);
    let user = null;
    if (mapped[p.key]) {
      user = byEmail[mapped[p.key]];
      if (!user) warn(`people.json: no account with email ${mapped[p.key]} (for ${p.name})`);
    }
    if (!user) {
      const hits = ctx.users.filter((u) => userKeys(u).includes(p.key));
      const byBadge = badge ? ctx.users.filter((u) => clean(u.badgeId) === badge) : [];
      const pick = hits.length === 1 ? hits : hits.length > 1 ? hits.filter((u) => byBadge.includes(u)) : byBadge;
      if (pick.length === 1) user = pick[0];
      else if (hits.length > 1) warn(`"${p.name}" matches ${hits.length} accounts (${hits.map((u) => u.email).join(", ")}): add it to people.json`);
    }
    if (user) {
      p.userId = idStr(user._id);
      p.matched = user.email;
      if (badge && !clean(user.badgeId)) userUpdates.push({ _id: user._id, set: { badgeId: badge }, why: `fingerprint ID ${badge}` });
      else if (badge && clean(user.badgeId) !== badge) warn(`${p.name}: the account has fingerprint ID ${user.badgeId}, the Excel says ${badge} (left as is)`);
      continue;
    }
    if (!ctx.createMissing || p.refs < 1) {
      p.userId = null;
      continue;
    }
    // Not in the system: an inactive account keeps their history (HR can fill it in and
    // activate it). The .invalid address can never receive mail.
    const mainCode = Object.entries(p.codes).sort((a, b) => b[1] - a[1])[0]?.[0];
    const words = p.name.split(/\s+/);
    const doc = {
      _id: ctx.newId(),
      email: freeEmail(badge ? `legacy.badge${badge}` : `legacy.person${newUsers.length + 1}`),
      name: p.name,
      nameAr: p.name,
      firstName: { ar: words[0] || "", en: "" },
      lastName: { ar: words.slice(1).join(" "), en: "" },
      role: "staff",
      status: "inactive",
      department: mainCode ? deptByCode[mainCode] : null,
      badgeId: badge,
      kpiExcluded: Boolean(p.employee?.kpiExcluded),
    };
    newUsers.push(doc);
    p.userId = idStr(doc._id);
    p.created = true;
  }
  const userOf = (name) => (clean(name) ? people[looseAr(name)]?.userId || null : null);
  const deptOfUser = Object.fromEntries([...ctx.users, ...newUsers].map((u) => [idStr(u._id), idStr(u.department)]));

  // Who reviewed (the old program kept no reviewer): the department's head.
  const headOf = {};
  for (const p of Object.values(people)) {
    const role = p.employee?.role || "";
    if (!p.userId) continue;
    if (role === "D-Head") headOf.ID = headOf.RD = p.userId;
    if (role === "T-Head") headOf.TO = p.userId;
  }
  for (const code of ["ID", "RD", "TO"]) {
    if (headOf[code]) continue;
    const head = ctx.users.find((u) => u.role === "dept_head" && (idStr(u.department) === deptByCode[code] || (u.managedDepartments || []).map(idStr).includes(deptByCode[code])));
    headOf[code] = head ? idStr(head._id) : ctx.actorId;
  }

  // ----- rating tags -----
  const tagByName = {};
  for (const tag of taskSettings.ratingTags) tagByName[looseAr(tag.name?.ar)] = tag;
  const TAG_ALIASES = { [looseAr("خطأ في الاتوكاد")]: "err_autocad", [looseAr("متميز بالاتوكاد")]: "exc_autocad" };
  const tagOf = (label) => {
    const l = clean(label);
    if (!l) return null;
    const tag = tagByName[looseAr(l)] || taskSettings.ratingTags.find((t) => t.key === TAG_ALIASES[looseAr(l)]);
    if (!tag) warn(`Rating "${l}" has no tag in Settings → Tasks (kept in the head's notes)`);
    return tag || null;
  };

  // ----- projects -----
  const registryByRef = {};
  for (const r of data.registry) if (r.Ref_Task_ID) registryByRef[r.Ref_Task_ID] = r;
  const projects = {}; // key → { key, name, codes, existing?, stages:Map, … }
  const projectOf = (name) => {
    const n = clean(name);
    if (!n) return null;
    const key = normalizeAr(n);
    return (projects[key] ||= { key, name: n, codes: {}, regCodes: {}, stageKeys: new Map(), cells: [], dates: [], expected: [], open: false });
  };
  for (const r of data.registry) {
    const p = projectOf(r.Project_Name);
    const code = deptCodeOf(r.Department);
    if (!p || !code) continue;
    p.regCodes[code] = (p.regCodes[code] || 0) + 1;
    if (r.Expected_Date) p.expected.push(localDate(r.Expected_Date, tz));
  }
  for (const r of data.tasks) {
    const p = projectOf(r["المشروع"]);
    const code = deptCodeOf(r["القسم"]);
    if (p && code && code !== "MEETING") p.codes[code] = (p.codes[code] || 0) + 1;
  }
  for (const p of Object.values(projects)) {
    const counts = Object.keys(p.regCodes).length ? p.regCodes : p.codes;
    p.primary = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "ID";
    p.existing = ctx.projects.find((x) => x.legacyKey === `excel:${p.key}` || normalizeAr(x.name?.ar) === p.key || normalizeAr(x.name?.en) === p.key) || null;
    if (p.existing) p.primary = codeOfDept[idStr(p.existing.department)] || p.primary;
  }
  // The stage key on the project: another department's stage gets its code in front.
  const stageKeyIn = (p, code, base) => (code === p.primary ? base : `${code.toLowerCase()}_${base}`);
  const useStage = (p, code, base, label) => {
    const key = stageKeyIn(p, code, base);
    if (!p.stageKeys.has(key)) p.stageKeys.set(key, { code, base, label });
    return key;
  };

  // ----- tasks -----
  const tasks = [];
  const skipped = [];
  const numbers = new Set();
  let collisions = 0;
  for (const r of data.tasks) {
    const oldId = Number(r.ID);
    if (ctx.existingLegacyIds.has(oldId)) {
      report.counts.tasksAlreadyImported = (report.counts.tasksAlreadyImported || 0) + 1;
      continue;
    }
    const code = deptCodeOf(r["القسم"]);
    const assignee = userOf(r["المهندس"]);
    const start = localDate(r["وقت و تاريخ البدء"], tz);
    if (!assignee || !start) {
      skipped.push({ id: oldId, why: !clean(r["المهندس"]) ? "no engineer" : !assignee ? `no account for ${r["المهندس"]}` : "no start date" });
      continue;
    }
    const meeting = code === "MEETING";
    const emp = clean(r["Employee Status"]);
    const head = clean(r["Head Status"]);
    const typeLabel = clean(r["نوع المهمة"]);
    let typeKey = meeting ? "meeting" : typeKeyOf(typeLabel);
    if (typeKey && !typeKeys.has(typeKey)) {
      warn(`Task type "${typeLabel}" (${typeKey}) is not in Settings → Tasks: imported as "other"`);
      typeKey = "other";
    }
    const p = meeting ? null : projectOf(r["المشروع"]);
    const scope = code === "ID" ? r["التصميم الداخلي"] : code === "RD" ? r["المطورين العقارين"] : code === "TO" ? r["المكتب الفني"] : "";
    const { stage: base, title } = p ? stageOf(code, typeKey, scope, typeLabel, templates) : { stage: "", title: "" };
    const stage = p ? useStage(p, code, base, (code === "RD" && clean(scope)) || typeLabel) : "";
    const revision = meeting ? 0 : revisionOf(r.Revision);
    const helping = /help/i.test(emp);

    let status;
    if (meeting) status = "done";
    else if (emp === "Cancelled") status = "cancelled";
    else if (head === "Approved") status = "approved";
    else if (head === "Reject") status = "rejected";
    else if (head === "Pending") status = "submitted";
    else if (emp === "On Going" || emp === "Helping") status = "in_progress";
    else if (emp === "ON Hold") status = "on_hold";
    else if (/^End/i.test(emp)) status = "submitted";
    else status = "todo";

    const finish = localDate(r["وقت إنهاء المهام"], tz);
    const due = localDate(r["وقت و تاريخ  التسليم المتوقع"], tz);
    const total = parseDuration(r["إجمالي الوقت المهام"]);
    const hold = parseDuration(r["مدة توقف المهام"]) ?? (Number(r["2"]) > 0 ? Math.round(Number(r["2"]) * DAY) : 0);
    const between = parseDuration(r["المدة الزمنية بين الامرين"]);
    const reviewed = ["approved", "rejected"].includes(status);
    const handedIn = ["submitted", "approved", "rejected", "done"].includes(status);
    const submittedAt = handedIn ? finish || (due && due > start ? due : null) || start : null;
    let reviewedAt = reviewed ? excelSerialDate(r["4"], tz) || (submittedAt && between != null ? new Date(submittedAt.getTime() + between) : submittedAt) : null;
    if (reviewedAt && submittedAt && reviewedAt < submittedAt) reviewedAt = submittedAt;

    const tag = reviewed ? tagOf(r["تقييم رئيس القسم للمهام"]) : null;
    const ratingText = clean(r["تقييم رئيس القسم للمهام"]);
    let headNotes = clean(r["ملاحظات رئيس القسم"]);
    if (ratingText && !tag) headNotes = [ratingText, headNotes].filter(Boolean).join(" — ");
    const rejectCause = status === "rejected" ? (tag?.key === "err_management" ? "management" : "employee") : "";
    const reviewer = code && headOf[code] ? headOf[code] : ctx.actorId;
    const registry = registryByRef[oldId];

    let number = oldId;
    if (ctx.existingNumbers.has(number) || numbers.has(number)) collisions += 1;
    numbers.add(number);

    const doc = {
      _id: ctx.newId(),
      number,
      kind: meeting ? "meeting" : helping ? "help" : revision > 0 && p ? "revision" : "task",
      title: meeting ? clean(r["القسم"]) : title,
      project: p ? p : null, // resolved to the project's id below
      stage,
      department: meeting ? deptOfUser[assignee] || null : deptByCode[code] || null,
      type: typeKey || "other",
      assignee,
      createdBy: ctx.actorId,
      priority: "normal",
      revision,
      status,
      plannedStart: start,
      dueAt: due,
      dueManual: true,
      estimatedHours: Number(registry?.Estimated_Hours) > 0 ? Number(registry.Estimated_Hours) : 0,
      deliveryLink: clean(r["رابط ملف التسليم"]),
      employeeNotes: clean(r["ملاحظات الموظف"]),
      headNotes,
      startedAt: start,
      lastResumedAt: status === "in_progress" ? start : null,
      pausedAt: status === "on_hold" ? localDate(r["1"], tz) || finish || start : null,
      activeMs: status === "in_progress" ? 0 : total ?? (finish ? Math.max(0, finish - start - (hold || 0)) : 0),
      holdMs: hold || 0,
      submittedAt,
      reviewedBy: reviewed ? reviewer : null,
      reviewedAt,
      ratings: tag ? [tag.key] : [],
      rejectCause,
      reviewLevel: status === "submitted" ? "manager" : "",
      reviews:
        reviewed && reviewer
          ? [{ level: "manager", covers: ["manager"], by: reviewer, at: reviewedAt || submittedAt || start, decision: status === "approved" ? "approve" : "reject", ratings: tag ? [tag.key] : [], notes: headNotes, rejectCause }]
          : [],
      cancelledAt: status === "cancelled" ? finish || start : null,
      cancelledBy: status === "cancelled" ? ctx.actorId : null,
      cancelReason: status === "cancelled" ? "Excel" : "",
      // Old work is never reminded about again.
      dueReminderSent: true,
      overdueNotified: true,
      legacy: { source: "excel", id: oldId },
      createdAt: start,
      updatedAt: reviewedAt || submittedAt || finish || start,
      _chain: p ? `${p.key}|${stage}|${normalizeAr(title)}` : null,
    };
    tasks.push(doc);
    if (p) {
      p.dates.push(start, finish, due, reviewedAt);
      if (["todo", "in_progress", "on_hold", "help", "submitted"].includes(status)) p.open = true;
    }
  }
  if (collisions && !ctx.renumber) {
    report.fatal = `${collisions} old task numbers are already used by tasks in the system. Run again with --renumber to give the imported tasks new numbers (their old number stays in legacy.id).`;
  }
  if (ctx.renumber) {
    let n = ctx.nextNumber;
    // The old number stays visible on the task (the Excel notes refer to it: "رقم ID 1273").
    for (const t of tasks.sort((a, b) => a.legacy.id - b.legacy.id)) {
      t.number = ++n;
      t.description = `Excel #${t.legacy.id}`;
    }
  }

  // Revision chains: R-01 follows R-00 of the same room / stage.
  const chains = {};
  for (const t of tasks) if (t._chain) (chains[t._chain] ||= []).push(t);
  for (const list of Object.values(chains)) {
    list.sort((a, b) => a.revision - b.revision || a.plannedStart - b.plannedStart);
    for (let i = 1; i < list.length; i++) {
      const prev = [...list.slice(0, i)].reverse().find((x) => x.revision < list[i].revision);
      if (prev) {
        list[i].previousTask = prev._id;
        list[i].revisionCause = prev.rejectCause || "";
      }
    }
  }
  const taskByOld = Object.fromEntries(tasks.map((t) => [t.legacy.id, t]));

  // ----- redos the old board was still waiting for -----
  const redos = [];
  let nextNo = Math.max(ctx.nextNumber, ...tasks.map((t) => t.number));
  for (const r of data.registry) {
    if (r.Status !== "Reject" || !r.Ref_Task_ID) continue;
    const t = taskByOld[r.Ref_Task_ID];
    if (!t || t.status !== "rejected") continue;
    const later = (chains[t._chain] || []).some((x) => x !== t && x.revision > t.revision);
    if (later || ctx.existingLegacyRedos?.has(t.legacy.id)) continue;
    const hours = Number(r.Estimated_Hours) > 0 ? Number(r.Estimated_Hours) : 3;
    const plannedStart = localDate(r.Planned_Start_Date, tz);
    const dueAt = localDate(r.Task_Expected_Date, tz);
    redos.push({
      _id: ctx.newId(),
      number: ++nextNo,
      kind: t.project && t.stage ? "revision" : t.kind,
      title: t.title,
      project: t.project,
      stage: t.stage,
      department: t.department,
      type: t.type,
      assignee: userOf(r.Engineer_Name) || t.assignee,
      createdBy: ctx.actorId,
      priority: "normal",
      revision: t.revision + 1,
      revisionCause: t.rejectCause,
      previousTask: t._id,
      status: "todo",
      plannedStart,
      dueAt,
      estimatedHours: hours,
      maxHours: hours,
      dueManual: true,
      legacy: { source: "excel-redo", id: t.legacy.id },
    });
    if (t.project) t.project.open = true;
  }

  // ----- project documents -----
  const newProjects = [];
  const projectUpdates = [];
  const cellsBy = {};
  for (const r of data.registry) {
    const p = projects[normalizeAr(clean(r.Project_Name))];
    const code = deptCodeOf(r.Department);
    if (!p || !code) continue;
    const typeKey = typeKeyOf(r.Task_Type);
    const { stage: base } = stageOf(code, typeKey, r.Scope_Name, r.Task_Type, templates);
    const key = useStage(p, code, base, code === "RD" ? clean(r.Scope_Name) : clean(r.Task_Type));
    (cellsBy[`${p.key}|${key}`] ||= []).push(r);
    if (["Not yet", "On Going", "ON Hold", "Helping", "Pending"].includes(r.Status)) p.open = true;
  }
  for (const p of Object.values(projects)) {
    const used = [...p.stageKeys.entries()];
    if (!used.length && !p.existing) continue;
    const stageDoc = (key, { code, base, label }) => {
      const tpl = (templates[code] || []).find((s) => s.key === base);
      const typeKey = tpl?.taskType || (typeKeys.has(base) ? base : "other");
      const named = taskSettings.taskTypes.find((t) => t.key === typeKey)?.name;
      return {
        key,
        name: tpl ? { ...tpl.name } : { ar: label || named?.ar || base, en: label || named?.en || base },
        taskType: typeKey,
        department: code === p.primary ? null : deptByCode[code],
        waitForPrevious: false,
      };
    };
    const order = (key, v) => {
      const list = templates[v.code] || [];
      const i = list.findIndex((s) => s.key === v.base);
      return (v.code === p.primary ? 0 : 100) + (i < 0 ? 50 : i);
    };
    used.sort((a, b) => order(...a) - order(...b));
    // A board cell marked by hand ("Skip" / "Done" with no task) for the whole stage.
    const overrides = [];
    for (const [key] of used) {
      const cells = cellsBy[`${p.key}|${key}`] || [];
      const hasTasks = tasks.some((t) => t.project === p && t.stage === key);
      if (!cells.length || hasTasks) continue;
      if (cells.every((c) => c.Status === "Skip" || (c.Status === "Done" && !c.Ref_Task_ID))) {
        overrides.push({ item: null, stage: key, status: cells.some((c) => c.Status === "Done") ? "done" : "skip", reason: "Excel", by: ctx.actorId, at: new Date() });
      }
    }
    const dates = p.dates.filter(Boolean).map((d) => d.getTime());
    const expected = p.expected.filter(Boolean).map((d) => d.getTime());
    const last = dates.length ? Math.max(...dates) : Date.now();
    const participants = [...new Set(tasks.filter((t) => t.project === p).map((t) => t.assignee))];
    if (p.existing) {
      const have = new Set((p.existing.stages || []).map((s) => s.key));
      const addStages = used.filter(([k]) => !have.has(k)).map(([k, v]) => stageDoc(k, v));
      const haveOverride = new Set((p.existing.overrides || []).map((o) => o.stage));
      const addOverrides = overrides.filter((o) => !haveOverride.has(o.stage));
      p.id = p.existing._id;
      if (addStages.length || addOverrides.length || participants.length)
        projectUpdates.push({ _id: p.existing._id, name: p.name, addStages, addOverrides, participants });
      continue;
    }
    const doc = {
      _id: ctx.newId(),
      code: (p.name.match(PROJECT_CODE) || [])[1] || "",
      name: { ar: p.name, en: p.name },
      client: "",
      department: deptByCode[p.primary],
      participants,
      status: p.open ? "active" : "finished",
      priority: "normal",
      flow: "random", // the old work didn't follow the new stage order
      startDate: dates.length ? new Date(Math.min(...dates)) : null,
      dueDate: new Date(expected.length ? Math.max(...expected) : last),
      baselineDueDate: expected.length ? new Date(Math.max(...expected)) : null,
      stages: used.map(([k, v]) => stageDoc(k, v)),
      overrides,
      finishedAt: p.open ? null : new Date(last),
      createdBy: ctx.actorId,
      legacyKey: `excel:${p.key}`,
    };
    p.id = doc._id;
    newProjects.push(doc);
  }
  for (const t of [...tasks, ...redos]) {
    if (t.project && typeof t.project === "object" && "key" in t.project) t.project = t.project.id || null;
    delete t._chain;
  }

  // ----- attendance: fingerprint punches -----
  const punches = [];
  const seen = new Set();
  for (const r of data.rawLogs) {
    const badgeId = clean(r.BadgeID);
    const time = localDate(r.LogTime, tz);
    if (!badgeId || !time) continue;
    const k = `${badgeId}|${time.getTime()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    punches.push({ badgeId, time, source: "device", note: "Excel" });
  }
  const knownBadges = new Set([...ctx.users, ...newUsers].map((u) => clean(u.badgeId)).concat(userUpdates.map((u) => u.set.badgeId)).filter(Boolean));
  const orphanBadges = [...new Set(punches.map((x) => x.badgeId))].filter((b) => !knownBadges.has(b)).sort((a, b) => a - b);
  if (orphanBadges.length) {
    const n = orphanBadges.map((b) => `${b} (${punches.filter((x) => x.badgeId === b).length})`).join(", ");
    warn(`Fingerprint IDs with no person: ${n} punches. They are imported; set the ID on the right person (Staff → edit) and their attendance appears.`);
  }

  // ----- attendance: HR corrections -----
  const STATUS = { غائب: "absent", حاضر: "present", "إجازة سنوية": "annual_leave", "إجازة مرضية": "sick_leave", "عطلة أسبوعية": "weekend", "عطلة رسمية": "holiday", "إجازة بدون راتب": "unpaid_leave", "غياب مبرر": "justified_absence" };
  const statusOf = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [normalizeAr(k), v]));
  const overrideDocs = {};
  for (const r of data.overrides) {
    const user = userOf(r.EmpName);
    const date = String(r.TargetDate || "").slice(0, 10);
    if (!user || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      skipped.push({ override: `${r.EmpName} ${date}`, why: user ? "no date" : `no account for ${r.EmpName}` });
      continue;
    }
    const s = clean(r.StatusOverride);
    const w = clean(r.WarningOverride);
    let status = statusOf[normalizeAr(s)] || "";
    if (s && !status) warn(`Attendance status "${s}" is unknown (kept in the note)`);
    if (normalizeAr(w) === normalizeAr("غياب مبرر") && (!status || status === "absent")) status = "justified_absence";
    const k = `${user}|${date}`;
    if (overrideDocs[k]) report.counts.overrideDuplicates = (report.counts.overrideDuplicates || 0) + 1;
    overrideDocs[k] = {
      user,
      date,
      status,
      exemptWarnings: normalizeAr(w) === normalizeAr("إنذار معفي"),
      bonus: Number(r.Bonus) || 0,
      note: `Excel: ${[s, w].filter(Boolean).join(" / ")}`,
      by: ctx.actorId,
    };
  }

  // ----- KPI archive -----
  const INDICATOR_KEYS = ["attendance", "efficiency", "delivery", "quality", "cooperation", "skills"];
  // The Excel KPI-Calc items → the default configuration's items (lib/kpi/config.js).
  const EXCEL_KPI_ITEMS = Object.fromEntries(
    Object.entries({
      "تحقيق ساعات الدوام الشهرية": "hours",
      "الالتزام بمواعيد الدخول": "punctuality",
      "الإنذارات والمخالفات": "warnings",
      "عدد المهام المعتمدة": "approved",
      "سرعة الإنجاز": "speed",
      "استغلال وقت العمل": "utilization",
      "التسليم ضمن الموعد": "on_time",
      "ساعات التأخير في التسليم": "delay",
      "عدد المهام المتأخرة": "late_share",
      "الاعتماد من المرة الأولى": "first_time",
      "متوسط التعديلات": "revisions",
      "متوسط الرفض": "rejections",
      "عدد مرات (مساهمة لصالح موظف)": "help",
      "نسبة مساهمة الموظف لمجموع المساهمات": "share",
      "مهارات متقدمة (AI,Graphics Edit ..)": "advanced",
      "التصميم والحل الوظيفي والشوب دروينج": "design",
      "البرامج الهندسية الأساسية": "software",
    }).map(([k, v]) => [looseAr(k), v])
  );
  const currentMonth = ctx.today.slice(0, 7);
  const kpiGroups = {};
  for (const r of data.kpiArchive) {
    const m = String(r.EvalMonth || "").match(/^(\d{1,2})\/\d{1,2}\/(\d{4})$/);
    const user = userOf(r.EmpName);
    if (!m || !user) {
      skipped.push({ kpi: `${r.EmpName} ${r.EvalMonth}`, why: user ? "bad month" : `no account for ${r.EmpName}` });
      continue;
    }
    const month = `${m[2]}-${m[1].padStart(2, "0")}`;
    (kpiGroups[`${user}|${month}`] ||= { user, month, total: Number(r.TotalScore) || 0, rows: [] }).rows.push(r);
  }
  const kpiDocs = [];
  let kpiSkippedCurrent = 0;
  for (const g of Object.values(kpiGroups)) {
    if (g.month >= currentMonth && !ctx.kpiIncludeCurrent) {
      kpiSkippedCurrent += 1;
      continue;
    }
    const config = kpiConfigFor(ctx.settings?.kpi, g.month) || DEFAULT_KPI;
    const byInd = {};
    for (const r of g.rows) {
      const label = clean(r["نوع المؤشر"]);
      const n = Number((label.match(/^(\d+)/) || [])[1]);
      (byInd[n || label] ||= { n, label, rows: [] }).rows.push(r);
    }
    const num = (s) => {
      const x = Number(String(s ?? "").replace(/[%\s]/g, ""));
      return String(s ?? "").trim() !== "" && Number.isFinite(x) ? x : null;
    };
    const indicators = Object.values(byInd)
      .sort((a, b) => (a.n || 99) - (b.n || 99))
      .map((ind) => {
        const key = INDICATOR_KEYS[ind.n - 1] || `excel_${ind.n || "x"}`;
        const cfg = config.indicators.find((x) => x.key === key);
        const sum = ind.rows.find((r) => normalizeAr(r["بنود المؤشر"]) === normalizeAr("المجموع المؤشر"));
        const rows = ind.rows.filter((r) => r !== sum);
        // Each Excel item to its item in the configuration: by name, else by position
        // (both list them in the same order).
        const used = new Set();
        const sameName = (x, label) => looseAr(x.name?.ar) === looseAr(label) || looseAr(x.name?.ar).includes(looseAr(label)) || looseAr(label).includes(looseAr(x.name?.ar));
        const matched = rows.map((r) => {
          const label = clean(r["بنود المؤشر"]);
          const hit = cfg?.items.find((x) => x.key === EXCEL_KPI_ITEMS[looseAr(label)]) || cfg?.items.find((x) => sameName(x, label));
          if (hit) used.add(hit);
          return hit;
        });
        rows.forEach((r, i) => {
          if (matched[i] || !cfg) return;
          matched[i] = cfg.items.find((x, j) => j >= i && !used.has(x)) || cfg.items.find((x) => !used.has(x));
          if (matched[i]) used.add(matched[i]);
        });
        const items = rows
          .map((r, i) => {
            const label = clean(r["بنود المؤشر"]);
            const cfgItem = matched[i];
            // The value as the Excel showed it ("88%", "195:52"): its units aren't the
            // new metrics' units, so no metric is attached (the page adds none).
            return {
              key: cfgItem?.key || `item_${i + 1}`,
              name: { ar: label, en: cfgItem?.name?.en || label },
              metric: "",
              value: clean(r["نتيجة حساب المؤشر"]) || null,
              points: num(r["النقاط التحصيلية"]) || 0,
              max: cfgItem ? itemWeight(cfgItem) : null,
              note: clean(r["وصف المؤشر الحاصل عليه"]),
            };
          });
        const points = num(sum?.["النقاط التحصيلية"]) ?? items.reduce((a, x) => a + x.points, 0);
        const percent = num(sum?.["نتيجة حساب المؤشر"]);
        return {
          key,
          name: cfg?.name || { ar: ind.label.replace(/^\d+\s*-\s*/, ""), en: ind.label },
          points,
          max: cfg ? indicatorWeight(cfg) : percent ? Math.round((points * 100) / percent) : points,
          percent: percent ?? 0,
          items,
        };
      });
    const grade = config.grades.find((x) => g.total >= x.min) || config.grades.at(-1);
    kpiDocs.push({ user: g.user, month: g.month, total: g.total, systemScore: g.total, grade: grade?.name || {}, indicators, bonus: 0, legacy: true });
  }
  for (const month of new Set(kpiDocs.map((k) => k.month))) {
    const list = kpiDocs.filter((k) => k.month === month).sort((a, b) => b.total - a.total);
    list.forEach((k, i) => Object.assign(k, { rank: i + 1, of: list.length }));
  }

  report.counts = {
    ...report.counts,
    departmentsToCreate: newDepartments.length,
    peopleMatched: Object.values(people).filter((p) => p.userId && !p.created).length,
    peopleToCreate: newUsers.length,
    peopleWithoutAccount: Object.values(people).filter((p) => !p.userId && p.refs > 0).length,
    badgeIdsToSet: userUpdates.length,
    projectsToCreate: newProjects.length,
    projectsToUpdate: projectUpdates.length,
    tasks: tasks.length,
    tasksByStatus: tasks.reduce((m, t) => ((m[t.status] = (m[t.status] || 0) + 1), m), {}),
    tasksByKind: tasks.reduce((m, t) => ((m[t.kind] = (m[t.kind] || 0) + 1), m), {}),
    redosWaiting: redos.length,
    punches: punches.length,
    attendanceOverrides: Object.keys(overrideDocs).length,
    kpiResults: kpiDocs.length,
    kpiSkippedCurrentMonth: kpiSkippedCurrent,
    skippedRows: skipped.length,
  };
  report.people = Object.values(people)
    .filter((p) => p.refs > 0 || p.userId)
    .map((p) => ({ name: p.name, spellings: [...p.names], account: p.matched || (p.created ? "NEW (inactive)" : "NONE"), badge: p.employee?.badgeId || "", rows: p.refs }))
    .sort((a, b) => b.rows - a.rows);
  report.projects = Object.values(projects)
    .filter((p) => p.id)
    .map((p) => ({ name: p.name, department: p.primary, existing: Boolean(p.existing), stages: [...p.stageKeys.keys()].join(", "), status: p.existing ? "(kept)" : p.open ? "active" : "finished" }));
  report.skipped = skipped;

  return {
    report,
    newDepartments,
    newUsers,
    userUpdates,
    newProjects,
    projectUpdates,
    tasks,
    redos,
    punches,
    overrides: Object.values(overrideDocs),
    kpi: kpiDocs,
  };
}
