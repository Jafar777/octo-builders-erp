import { requirePermission } from "@/lib/currentUser";
import { getSettings } from "@/lib/settings";
import SettingsManager from "@/components/erp/settings/SettingsManager";
import NoAccess from "@/components/erp/NoAccess";

export default async function SettingsPage() {
  if (!(await requirePermission("settings.manage"))) return <NoAccess />;
  const settings = await getSettings();
  return <SettingsManager initial={JSON.parse(JSON.stringify(settings))} />;
}
