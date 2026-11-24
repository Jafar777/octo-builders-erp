// Which overview a person gets (app/api/home, components/dashboard/DashboardOverview):
// by their role when it's a known one, else by what their permissions say they do.
// Permissions still decide what data each section may load.
const BY_ROLE = {
  ceo: "executive",
  coder: "executive",
  gm: "executive",
  dept_head: "department",
  secretary: "office",
  coordinator: "office",
  hr: "hr",
};

export function homePersona(user) {
  if (!user?.isStaff) return "employee";
  if (BY_ROLE[user.role]) return BY_ROLE[user.role];
  const p = new Set(user.permissions || []);
  const all = user.scope === "all";
  if (all && p.has("users.manage") && p.has("finance.view")) return "executive";
  if (all && p.has("projects.manage") && p.has("tasks.assign")) return "projects";
  if (user.scope === "department" && p.has("tasks.review")) return "department";
  if (all && (p.has("leave.approve") || p.has("payroll.manage") || p.has("recruitment.manage"))) return "hr";
  if ((p.has("projects.intake") || p.has("sales.manage")) && !p.has("finance.view")) return "office";
  return "employee";
}
