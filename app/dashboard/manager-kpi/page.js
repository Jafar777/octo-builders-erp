import { requireStaff } from "@/lib/currentUser";
import { todayIn } from "@/lib/hr";
import { canRateManagers, isDeptManager } from "@/lib/managerKpi";
import { getSettings } from "@/lib/settings";
import ManagerKpiPage from "@/components/erp/kpi/ManagerKpiPage";
import NoAccess from "@/components/erp/NoAccess";

// GM / CEO rate department managers; department managers see their own result.
export default async function ManagerKpi() {
  const user = await requireStaff();
  if (!user || (!canRateManagers(user) && !isDeptManager(user))) return <NoAccess />;
  const settings = await getSettings();
  return <ManagerKpiPage initialMonth={todayIn(settings.hr.timezone).slice(0, 7)} />;
}
