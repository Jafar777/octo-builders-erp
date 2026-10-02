import { requirePermission } from "@/lib/currentUser";
import KpiConfig from "@/components/erp/kpi/KpiConfig";
import NoAccess from "@/components/erp/NoAccess";

export default async function KpiConfigPage() {
  if (!(await requirePermission("kpi.manage"))) return <NoAccess />;
  return <KpiConfig />;
}
