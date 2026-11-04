import { Suspense } from "react";
import { requirePermission } from "@/lib/currentUser";
import { CODER_ROLE, isHiddenRole } from "@/lib/permissions";
import { loadRolesWithCounts } from "@/lib/roles";
import RolesManager from "@/components/erp/roles/RolesManager";
import NoAccess from "@/components/erp/NoAccess";

export default async function RolesPage() {
  const user = await requirePermission("roles.manage");
  if (!user) return <NoAccess />;
  // The hidden coder role is only listed for a coder.
  const roles = (await loadRolesWithCounts()).filter((r) => user.role === CODER_ROLE || !isHiddenRole(r.key));
  return (
    <Suspense>
      <RolesManager initialRoles={roles} />
    </Suspense>
  );
}
