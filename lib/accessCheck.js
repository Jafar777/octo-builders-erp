// Checks a role's set-up for combinations that don't work (Roles page): a permission
// whose page is hidden, or one that needs another permission first. Pure: the editor
// runs it on the form before it's saved.
import { ALWAYS_PAGES, isTopRole, DEFAULT_ROLE, MOVED_PAGES } from "./permissions.js";

// The pages a permission is used on (any one of them is enough).
const USED_ON = {
  "website.manage": ["website"],
  "users.view": ["staff"],
  "roles.manage": ["system"],
  "org.manage": ["organization"],
  "settings.manage": ["settings"],
  "audit.view": ["system"],
  "system.health": ["system"],
  "messages.review": ["messages"],
  "messages.announce": ["messages"],
  "projects.view": ["projects"],
  "projects.manage": ["projects"],
  "projects.intake": ["intake"],
  "projects.accept": ["intake"],
  "intake.finance": ["intake"],
  "projects.delete": ["projects", "tasks"],
  "gantt.view": ["projects"],
  "gantt.edit": ["projects"],
  "tasks.assign": ["projects", "tasks", "teamTasks"],
  "tasks.review": ["reviews"],
  "attendance.view": ["hr"],
  "overtime.approve": ["orders"],
  "training.manage": ["training"],
  "recruitment.manage": ["hr"],
  "recruitment.assist": ["office", "hr"],
  "appraisals.manage": ["appraisals"],
  "kpi.view": ["kpi"],
  "kpi.manage": ["kpi", "managerKpi"],
  "analytics.view": ["analytics"],
  "finance.view": ["finance"],
  "pricing.use": ["finance"],
  "sales.manage": ["finance"],
  "purchasing.request": ["orders"],
  "purchasing.approve": ["orders"],
  "assets.manage": ["orders"],
  "files.manage": ["files"],
  "office.manage": ["office"],
};

// What a permission needs to be usable: its page only opens with the other one.
const NEEDS = {
  "users.manage": "users.view",
  "attendance.manage": "attendance.view",
  "payroll.view": "attendance.view",
  "payroll.manage": "attendance.view",
  "finance.manage": "finance.view",
  "invoices.manage": "finance.view",
  "pricing.use": "finance.view",
  "gantt.edit": "gantt.view",
};

// → [{ type: "page", page, permissions }] a hidden page, and what can't be used without it
//   [{ type: "needs", permission, needs }]  a permission missing the one it depends on
export function roleIssues(role) {
  // Restricted roles drop what they can't use themselves; the top and no-access roles are fixed.
  if (!role || role.limited || isTopRole(role.key) || role.key === DEFAULT_ROLE) return [];
  const perms = role.permissions || [];
  const pages = role.pages || [];
  const issues = [];
  if (pages.length) {
    const open = new Set([...ALWAYS_PAGES, ...pages.map((p) => MOVED_PAGES[p] || p)]);
    const hidden = {};
    const miss = (page, permission) => (hidden[page] ||= []).push(permission);
    for (const p of perms) {
      const on = USED_ON[p];
      if (on && !on.some((k) => open.has(k))) miss(on[0], p);
    }
    for (const [page, permissions] of Object.entries(hidden)) issues.push({ type: "page", page, permissions });
    // Department managers write their team's appraisals.
    if (role.scope === "department" && perms.includes("tasks.review") && !open.has("appraisals") && !hidden.appraisals) {
      issues.push({ type: "page", page: "appraisals", permissions: ["tasks.review"] });
    }
  }
  for (const p of perms) if (NEEDS[p] && !perms.includes(NEEDS[p])) issues.push({ type: "needs", permission: p, needs: NEEDS[p] });
  return issues;
}

// The two ways out of an issue, as changes to the form: give what's missing, or take the
// permission away (never more access than the person asked for by mistake).
export function giveMissing(role, issue) {
  if (issue.type === "page") return { ...role, pages: [...new Set([...role.pages, issue.page])] };
  return { ...role, permissions: [...new Set([...role.permissions, issue.needs])] };
}
export function dropUnused(role, issue) {
  const drop = issue.type === "page" ? issue.permissions : [issue.permission];
  return { ...role, permissions: role.permissions.filter((p) => !drop.includes(p)) };
}
