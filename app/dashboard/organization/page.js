import { hasPermission, requireStaff } from "@/lib/currentUser";
import { loadOrg } from "@/lib/org";
import OrgManager from "@/components/erp/org/OrgManager";
import NoAccess from "@/components/erp/NoAccess";

// Everyone sees the hierarchy; departments, branches and job titles stay with org.manage.
export default async function OrganizationPage() {
  const user = await requireStaff();
  if (!user) return <NoAccess />;
  const canManage = hasPermission(user, "org.manage");
  const org = canManage ? await loadOrg() : null;
  return <OrgManager initialOrg={org ? JSON.parse(JSON.stringify(org)) : null} canManage={canManage} />;
}
