import { ClipboardCheck, ListChecks, ScrollText, UsersRound } from "lucide-react";

// The task pages: one "Tasks" entry in the sidebar opens the first one the person may
// see, and each page's header links to the others (PageLinks). Same rule fields as
// the sidebar (see navItemVisible in DashboardShell).
export const TASK_PAGES = [
  { href: "/dashboard/tasks", key: "tasks", icon: ListChecks, staff: true },
  { href: "/dashboard/team-tasks", key: "teamTasks", icon: UsersRound, staff: true },
  // Reviewers, and customers reviewing the tasks marked for them.
  { href: "/dashboard/reviews", key: "reviews", icon: ClipboardCheck, badge: "reviews", show: (u) => (u.isStaff && u.permissions.includes("tasks.review")) || u.isCustomer },
  // GM / CEO: every task of a month.
  { href: "/dashboard/task-log", key: "taskLog", icon: ScrollText, when: (u) => u.permissions.includes("projects.manage") && u.scope === "all" },
];
