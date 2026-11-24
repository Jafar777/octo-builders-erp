import { getCurrentUser } from "@/lib/currentUser";
import { canUseOffice } from "@/lib/officeServer";
import OfficeWorkspace from "@/components/erp/office/OfficeWorkspace";
import NoAccess from "@/components/erp/NoAccess";

// The executive office: the secretary's workspace (office.manage, and the CEO).
export default async function OfficePage() {
  const user = await getCurrentUser();
  if (!canUseOffice(user)) return <NoAccess />;
  return <OfficeWorkspace />;
}
