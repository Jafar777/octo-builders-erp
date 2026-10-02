import { requireStaff } from "@/lib/currentUser";
import { todayIn } from "@/lib/hr";
import { getSettings } from "@/lib/settings";
import KpiView from "@/components/erp/kpi/KpiView";
import NoAccess from "@/components/erp/NoAccess";

export default async function KpiPage() {
  const user = await requireStaff();
  if (!user) return <NoAccess />;
  const settings = await getSettings();
  return <KpiView initialMonth={todayIn(settings.hr.timezone).slice(0, 7)} meId={user.id} />;
}
