import { requirePermission } from "@/lib/currentUser";
import { loadRolesWithCounts } from "@/lib/roles";
import RolesManager from "@/components/erp/roles/RolesManager";
import NoAccess from "@/components/erp/NoAccess";

export default async function RolesPage() {
  if (!(await requirePermission("roles.manage"))) return <NoAccess />;
  return <RolesManager initialRoles={await loadRolesWithCounts()} />;
}
