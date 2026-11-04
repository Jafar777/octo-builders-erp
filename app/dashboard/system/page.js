import { requirePermission } from "@/lib/currentUser";
import SystemHealth from "@/components/erp/system/SystemHealth";
import NoAccess from "@/components/erp/NoAccess";

export default async function SystemPage() {
  if (!(await requirePermission("system.health"))) return <NoAccess />;
  return <SystemHealth />;
}
