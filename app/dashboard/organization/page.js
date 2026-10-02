import { requirePermission } from "@/lib/currentUser";
import { loadOrg } from "@/lib/org";
import OrgManager from "@/components/erp/org/OrgManager";
import NoAccess from "@/components/erp/NoAccess";

export default async function OrganizationPage() {
  if (!(await requirePermission("org.manage"))) return <NoAccess />;
  const org = await loadOrg();
  return <OrgManager initialOrg={JSON.parse(JSON.stringify(org))} />;
}
