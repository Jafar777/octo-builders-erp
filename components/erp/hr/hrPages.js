import { BriefcaseBusiness, Building2, UserCheck, Users } from "lucide-react";

// Human resources: one sidebar link for these pages (the first one the person may see;
// a single visible page shows as itself), joined by the HrTabs bar. Each keeps its own
// address, permission and place in the Roles page. Same rule fields as the sidebar.
export const HR_PAGES = [
  { href: "/dashboard/hr", key: "hr", icon: BriefcaseBusiness, also: ["/dashboard/recruitment"], when: (u) => ["attendance.view", "recruitment.manage"].some((p) => u.permissions.includes(p)) },
  { href: "/dashboard/staff", key: "staff", icon: Users, perm: "users.view" },
  // Everyone sees the hierarchy; the rest of the page stays with org.manage.
  { href: "/dashboard/organization", key: "organization", icon: Building2, staff: true },
  // GM / CEO (rate) and department managers (see their own).
  {
    href: "/dashboard/manager-kpi",
    key: "managerKpi",
    icon: UserCheck,
    when: (u) => (u.scope === "all" && u.permissions.includes("kpi.manage")) || (u.scope === "department" && u.permissions.includes("tasks.review")),
  },
];

// The HR page's own tabs this person may open.
export function hrTabsOf(user) {
  const has = (p) => Boolean(user?.permissions?.includes(p));
  const all = user?.scope === "all";
  return [
    has("attendance.view") && "attendance",
    has("payroll.manage") && all && "payroll",
    has("recruitment.manage") && "recruitment",
    has("attendance.manage") && all && "devices",
    has("payroll.manage") && all && "rules",
  ].filter(Boolean);
}
