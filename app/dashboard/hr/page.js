import { requirePermission } from "@/lib/currentUser";
import { todayIn } from "@/lib/hr";
import { getSettings } from "@/lib/settings";
import HrCenter from "@/components/erp/hr/HrCenter";
import NoAccess from "@/components/erp/NoAccess";

export default async function HrPage() {
  const user = await requirePermission("attendance.view");
  if (!user?.isStaff) return <NoAccess />;
  const settings = await getSettings();
  return <HrCenter initialMonth={todayIn(settings.hr.timezone).slice(0, 7)} />;
}
