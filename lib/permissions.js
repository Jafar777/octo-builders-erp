// Permission keys are the building blocks of roles. Roles themselves live in the
// database (models/Role.js) and are editable by the general manager; the defaults
// below are only used to seed them. The CEO edits roles, and each person's
// overrides, on the Roles page.

export const PERMISSIONS = [
  { key: "website.manage", group: "website" },
  { key: "users.view", group: "people" },
  { key: "users.manage", group: "people" },
  { key: "roles.manage", group: "people" },
  { key: "org.manage", group: "organization" },
  { key: "settings.manage", group: "organization" },
  { key: "audit.view", group: "organization" },
  // The System page: errors on the live site and everyone's sign-ins.
  { key: "system.health", group: "organization" },
  // Build and save own reports (Reports page), within their scope and permissions.
  { key: "reports.build", group: "organization" },
  { key: "messages.review", group: "messages" },
  { key: "messages.announce", group: "messages" },
  { key: "projects.view", group: "projects" },
  { key: "projects.manage", group: "projects" },
  // Fill in new-project intake forms (the secretary); never the money side.
  { key: "projects.intake", group: "projects" },
  // Fill in the money side of an intake form (the general manager); nothing else of finance.
  { key: "intake.finance", group: "projects" },
  // The Gantt timeline: see it (department-scoped roles: their departments only) and
  // edit it (schedule, rank projects, baselines, milestones).
  { key: "gantt.view", group: "projects" },
  { key: "gantt.edit", group: "projects" },
  { key: "tasks.assign", group: "projects" },
  { key: "tasks.review", group: "projects" },
  { key: "attendance.view", group: "hr" },
  { key: "attendance.manage", group: "hr" },
  { key: "leave.approve", group: "hr" },
  // Approve / reject overtime requests (department scope: their departments).
  { key: "overtime.approve", group: "hr" },
  // Run the Training Program: see every trainee, give tasks, rate, mark trainees.
  { key: "training.manage", group: "hr" },
  // Hiring (openings, candidates, onboarding) and performance review cycles.
  { key: "recruitment.manage", group: "hr" },
  { key: "appraisals.manage", group: "hr" },
  { key: "payroll.view", group: "hr" },
  { key: "payroll.manage", group: "hr" },
  { key: "kpi.view", group: "hr" },
  { key: "kpi.manage", group: "hr" },
  { key: "analytics.view", group: "hr" },
  { key: "finance.view", group: "finance" },
  { key: "finance.manage", group: "finance" },
  { key: "pricing.use", group: "finance" },
  // Client invoices from Gantt milestones, payments against them, money owed.
  { key: "invoices.manage", group: "finance" },
  // Leads and quotations (Sales page); an accepted quotation becomes an intake form.
  { key: "sales.manage", group: "sales" },
  // Purchasing: ask to buy, approve purchases / suppliers, the company's assets.
  { key: "purchasing.request", group: "purchasing" },
  { key: "purchasing.approve", group: "purchasing" },
  { key: "assets.manage", group: "purchasing" },
];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

// Permissions that open money, people's records or the system itself: the Roles page
// flags them so they're never given by accident.
export const SENSITIVE_PERMISSIONS = [
  "users.manage",
  "roles.manage",
  "settings.manage",
  "website.manage",
  "intake.finance",
  "gantt.edit",
  "payroll.view",
  "payroll.manage",
  "finance.view",
  "finance.manage",
  "messages.review",
  "invoices.manage",
  "purchasing.approve",
  "system.health",
];

// Every page of the dashboard, for the Roles page: a role (or one person) can be kept
// to some pages only. Profile, overview and notifications are always open.
export const PAGES = [
  { key: "overview", href: "/dashboard", group: "main" },
  { key: "profile", href: "/dashboard/profile", group: "main" },
  { key: "tasks", href: "/dashboard/tasks", group: "main" },
  { key: "taskLog", href: "/dashboard/task-log", group: "main" },
  { key: "teamTasks", href: "/dashboard/team-tasks", group: "main" },
  { key: "projects", href: "/dashboard/projects", group: "main" },
  { key: "intake", href: "/dashboard/intake", group: "main" },
  { key: "reviews", href: "/dashboard/reviews", group: "main" },
  { key: "attendance", href: "/dashboard/attendance", group: "main" },
  { key: "overtime", href: "/dashboard/overtime", group: "main" },
  { key: "kpi", href: "/dashboard/kpi", group: "main" },
  { key: "bonus", href: "/dashboard/bonus", group: "main" },
  { key: "messages", href: "/dashboard/messages", group: "main" },
  { key: "notifications", href: "/dashboard/notifications", group: "main" },
  { key: "training", href: "/dashboard/training", group: "main" },
  { key: "purchasing", href: "/dashboard/purchasing", group: "main" },
  { key: "appraisals", href: "/dashboard/appraisals", group: "main" },
  { key: "analytics", href: "/dashboard/analytics", group: "management" },
  { key: "reports", href: "/dashboard/reports", group: "management" },
  { key: "sales", href: "/dashboard/sales", group: "management" },
  { key: "recruitment", href: "/dashboard/recruitment", group: "management" },
  { key: "managerKpi", href: "/dashboard/manager-kpi", group: "management" },
  { key: "hr", href: "/dashboard/hr", group: "management" },
  { key: "finance", href: "/dashboard/finance", group: "management" },
  { key: "pricing", href: "/dashboard/pricing", group: "management" },
  { key: "staff", href: "/dashboard/staff", group: "management" },
  { key: "roles", href: "/dashboard/roles", group: "management" },
  { key: "organization", href: "/dashboard/organization", group: "management" },
  { key: "audit", href: "/dashboard/audit", group: "management" },
  { key: "settings", href: "/dashboard/settings", group: "management" },
  { key: "website", href: "/dashboard/website", group: "management" },
  { key: "system", href: "/dashboard/system", group: "management" },
];
export const PAGE_KEYS = PAGES.map((p) => p.key);
export const ALWAYS_PAGES = ["overview", "profile", "notifications"];
// What a restricted (outside the organization) account can ever open.
export const RESTRICTED_PAGES = ["profile", "messages", "intake", "notifications"];
// ...and the only permissions it can ever use (the intake forms and their money side):
// anything else a restricted role holds is ignored, so "restricted" always means it.
export const RESTRICTED_PERMISSIONS = ["projects.intake", "intake.finance"];

// The departments whose tasks a person can be given: "all", or their own department,
// the ones they head and the extra ones the CEO opened for them (Roles page). The CEO
// gives work to anyone regardless; this is what department managers are held to.
export function workDepartments(role, person) {
  const own = person?.access?.crossDepartment;
  if (own === true || (own !== false && role?.crossDepartment)) return "all";
  const ids = [person?.department, ...(person?.managedDepartments || []), ...(person?.access?.workDepartments || [])];
  return [...new Set(ids.filter(Boolean).map(String))];
}
export const canWorkIn = (work, departmentId) => work === "all" || (Boolean(departmentId) && work.includes(String(departmentId)));

// The page a dashboard path belongs to (the longest matching href), or null.
export function pageForPath(path) {
  let best = null;
  for (const p of PAGES) {
    if ((path === p.href || path.startsWith(`${p.href}/`)) && (!best || p.href.length > best.href.length)) best = p;
  }
  return best?.key || null;
}

// A role's access with one person's overrides on top (User.access):
//   grant / deny: permissions added to / taken from what the role gives,
//   scope: another data scope than the role's,
//   hiddenPages: pages taken away from what the role shows.
// The top roles (CEO, coder) always keep everything: nobody can lock them out.
export function effectiveAccess(role, overrides = {}, roleKey = role?.key) {
  if (isTopRole(roleKey)) {
    return { permissions: [...PERMISSION_KEYS], scope: "all", pages: null, limited: false };
  }
  const grant = (overrides?.grant || []).filter((p) => PERMISSION_KEYS.includes(p));
  const deny = new Set(overrides?.deny || []);
  const limited = Boolean(role?.limited);
  const permissions = [...new Set([...(role?.permissions || []), ...grant])].filter(
    (p) => !deny.has(p) && (!limited || RESTRICTED_PERMISSIONS.includes(p))
  );
  const scope = SCOPES.includes(overrides?.scope) ? overrides.scope : role?.scope || "self";
  const hidden = new Set(overrides?.hiddenPages || []);
  // null = every page their permissions open.
  let pages = Array.isArray(role?.pages) && role.pages.length ? role.pages : null;
  if (limited) pages = (pages || RESTRICTED_PAGES).filter((p) => RESTRICTED_PAGES.includes(p));
  if (hidden.size) pages = (pages || PAGE_KEYS).filter((p) => !hidden.has(p));
  if (pages) pages = [...new Set([...ALWAYS_PAGES, ...pages])];
  return { permissions, scope, pages, limited };
}

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
// Only the default: the CEO can change it on the Roles page (Role.limited).
export const LIMITED_ROLES = ["gm"];
export const GM_PERMISSIONS = ["projects.intake", "intake.finance"];
export const isLimitedRole = (key) => LIMITED_ROLES.includes(key);

export const DEFAULT_ROLES = [
  {
    key: "gm",
    name: { ar: "المدير العام", en: "General Manager" },
    permissions: GM_PERMISSIONS,
    scope: "self",
    limited: true,
    pages: RESTRICTED_PAGES,
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
      "recruitment.manage",
      "appraisals.manage",
      "assets.manage",
      "reports.build",
      "purchasing.request",
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
      "gantt.view",
      "attendance.view",
      "overtime.approve",
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
    permissions: ["projects.intake", "sales.manage", "purchasing.request"],
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
