import { requireStaff } from "@/lib/currentUser";
import { todayIn } from "@/lib/hr";
import { getSettings } from "@/lib/settings";
import BonusPage from "@/components/erp/kpi/BonusPage";
import NoAccess from "@/components/erp/NoAccess";

export default async function Bonus() {
  const user = await requireStaff();
  if (!user) return <NoAccess />;
  const settings = await getSettings();
  return <BonusPage initialMonth={todayIn(settings.hr.timezone).slice(0, 7)} />;
}
