import { redirect } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/currentUser";
import { todayIn } from "@/lib/hr";
import { getSettings } from "@/lib/settings";
import HrCenter from "@/components/erp/hr/HrCenter";
import NoAccess from "@/components/erp/NoAccess";

export default async function HrPage({ searchParams }) {
  // Leave moved to the Requests page (older links).
  if ((await searchParams).tab === "leave") redirect("/dashboard/orders?type=leave");
  // Attendance and pay, and hiring: each tab keeps its own permission.
  const user = await getCurrentUser();
  if (!user?.isStaff || user.limited || !["attendance.view", "recruitment.manage"].some((p) => hasPermission(user, p))) return <NoAccess />;
  const settings = await getSettings();
  return <HrCenter initialMonth={todayIn(settings.hr.timezone).slice(0, 7)} />;
}
