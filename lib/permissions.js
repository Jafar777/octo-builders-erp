// Permission keys are the building blocks of roles. Roles themselves live in the
// database (models/Role.js) and are editable by the general manager; the defaults
// below are only used to seed them.

export const PERMISSIONS = [
  { key: "website.manage", group: "website" },
  { key: "users.view", group: "people" },
  { key: "users.manage", group: "people" },
  { key: "roles.manage", group: "people" },
  { key: "org.manage", group: "organization" },
  { key: "settings.manage", group: "organization" },
  { key: "audit.view", group: "organization" },
  { key: "messages.review", group: "messages" },
  { key: "messages.announce", group: "messages" },
  { key: "projects.view", group: "projects" },
  { key: "projects.manage", group: "projects" },
  // Fill in new-project intake forms (the secretary); never the money side.
  { key: "projects.intake", group: "projects" },
  // Fill in the money side of an intake form (the general manager); nothing else of finance.
  { key: "intake.finance", group: "projects" },
  { key: "tasks.assign", group: "projects" },
  { key: "tasks.review", group: "projects" },
  { key: "attendance.view", group: "hr" },
  { key: "attendance.manage", group: "hr" },
  { key: "leave.approve", group: "hr" },
  { key: "payroll.view", group: "hr" },
  { key: "payroll.manage", group: "hr" },
  { key: "kpi.view", group: "hr" },
  { key: "kpi.manage", group: "hr" },
  { key: "analytics.view", group: "hr" },
  { key: "finance.view", group: "finance" },
  { key: "finance.manage", group: "finance" },
  { key: "pricing.use", group: "finance" },
];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

// "scope" limits what a role sees of other people's data: only themselves, their
// department, or the whole company.
export const SCOPES = ["self", "department", "all"];

// The role every self-signup gets until the general manager assigns a real one.
// It has no access to the ERP (public website user / client later).
export const DEFAULT_ROLE = "user";

// Roles that cannot be deleted. The CEO always keeps every permission so the company can
// never lock itself out; the GM's permissions are fixed (see LIMITED_ROLES).
export const SYSTEM_ROLES = ["ceo", "gm", "user", "coder"];

// The top role: every permission, company-wide.
export const TOP_ROLE = "ceo";

// "coder": a hidden debugging role with everything the CEO has. Nobody else sees it:
// it isn't on the staff, roles, HR / KPI or messaging lists, nor in the organization,
// it gets no automatic notifications, and only a coder can give or change it.
// Accounts are made coders from the CODER_EMAILS setting (.env), see lib/erpSeed.js.
export const CODER_ROLE = "coder";
export const HIDDEN_ROLES = [CODER_ROLE];
// Everything the CEO may do, the coder may too.
export const TOP_ROLES = [TOP_ROLE, CODER_ROLE];
export const isTopRole = (key) => TOP_ROLES.includes(key);
export const isHiddenRole = (key) => HIDDEN_ROLES.includes(key);

// Roles that only get their own messages, notifications, profile and the intake forms
// (new forms and their money side) — nothing else of the dashboard, and they aren't
// part of the organization chart or the company / department chat channels.
export const LIMITED_ROLES = ["gm"];
export const GM_PERMISSIONS = ["projects.intake", "intake.finance"];
export const isLimitedRole = (key) => LIMITED_ROLES.includes(key);

export const DEFAULT_ROLES = [
  {
    key: "gm",
    name: { ar: "المدير العام", en: "General Manager" },
    permissions: GM_PERMISSIONS,
    scope: "self",
  },
  {
    key: "ceo",
    name: { ar: "المدير التنفيذي", en: "CEO" },
    permissions: PERMISSION_KEYS,
    scope: "all",
  },
  {
    key: "coder",
    name: { ar: "مبرمج", en: "Coder" },
    permissions: PERMISSION_KEYS,
    scope: "all",
  },
  {
    key: "hr",
    name: { ar: "الموارد البشرية", en: "HR" },
    permissions: [
      "users.view",
      "projects.view",
      "attendance.view",
      "attendance.manage",
      "leave.approve",
      "payroll.view",
      "payroll.manage",
      "kpi.view",
      "analytics.view",
    ],
    scope: "all",
  },
  {
    key: "dept_head",
    name: { ar: "رئيس قسم", en: "Department Head" },
    permissions: [
      "users.view",
      "messages.review",
      "messages.announce",
      "projects.view",
      "projects.manage",
      "tasks.assign",
      "tasks.review",
      "attendance.view",
      "kpi.view",
      "analytics.view",
    ],
    scope: "department",
  },
  {
    key: "project_manager",
    name: { ar: "مدير مشروع", en: "Project Manager" },
    permissions: ["users.view", "projects.view", "projects.manage", "tasks.assign", "analytics.view", "pricing.use"],
    scope: "department",
  },
  {
    key: "coordinator",
    name: { ar: "منسق", en: "Coordinator" },
    permissions: ["users.view", "projects.view"],
    scope: "all",
  },
  {
    key: "secretary",
    name: { ar: "سكرتارية", en: "Secretary" },
    permissions: ["projects.intake"],
    scope: "self",
  },
  {
    key: "staff",
    name: { ar: "موظف", en: "Staff" },
    permissions: [],
    scope: "self",
  },
  {
    key: "user",
    name: { ar: "مستخدم (بدون صلاحيات)", en: "User (no access)" },
    permissions: [],
    scope: "self",
  },
];

// Accounts created before the role system used "admin".
export function normalizeRoleKey(key) {
  return key === "admin" ? TOP_ROLE : key || DEFAULT_ROLE;
}

export function isStaffRole(key) {
  return normalizeRoleKey(key) !== DEFAULT_ROLE;
}
