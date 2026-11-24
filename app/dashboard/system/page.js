import { Suspense } from "react";
import { getCurrentUser, hasPermission } from "@/lib/currentUser";
import { canImportLegacy } from "@/lib/legacySync";
import { canSeeChangeLog } from "@/lib/changeLog";
import { CODER_ROLE, isHiddenRole } from "@/lib/permissions";
import { loadRolesWithCounts } from "@/lib/roles";
import SystemCenter from "@/components/erp/system/SystemCenter";
import NoAccess from "@/components/erp/NoAccess";

// System: its health (errors, sign-ins), roles and permissions, the audit log, the change
// log between the CEO and the programmer (lib/changeLog.js) and adding the old program's
// data, each a tab for whoever may see it.
export default async function SystemPage() {
  const user = await getCurrentUser();
  const managesRoles = hasPermission(user, "roles.manage");
  const tabs = [
    hasPermission(user, "system.health") && "health",
    managesRoles && "roles",
    hasPermission(user, "audit.view") && "audit",
    canSeeChangeLog(user) && "changes",
    canImportLegacy(user) && "import",
  ].filter(Boolean);
  if (!user?.isStaff || !tabs.length) return <NoAccess />;
  // The hidden coder role is only listed for a coder.
  const roles = managesRoles ? (await loadRolesWithCounts()).filter((r) => user.role === CODER_ROLE || !isHiddenRole(r.key)) : [];
  return (
    <Suspense>
      <SystemCenter tabs={tabs} roles={roles} />
    </Suspense>
  );
}
