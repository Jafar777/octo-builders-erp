import { CalendarClock, UserRound } from "lucide-react";

// One "My profile" sidebar link: the profile, and attendance & salary for staff
// (accounts with no role yet see the profile alone). See TASK_PAGES.
export const PROFILE_PAGES = [
  { href: "/dashboard/profile", key: "profile", icon: UserRound },
  { href: "/dashboard/attendance", key: "attendance", icon: CalendarClock, staff: true },
];
