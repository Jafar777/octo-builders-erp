import { requirePermission } from "@/lib/currentUser";
import AuditLogView from "@/components/erp/audit/AuditLogView";
import NoAccess from "@/components/erp/NoAccess";

export default async function AuditPage() {
  if (!(await requirePermission("audit.view"))) return <NoAccess />;
  return <AuditLogView />;
}
