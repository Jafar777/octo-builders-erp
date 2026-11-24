import { requireStaff } from "@/lib/currentUser";
import { canUseOffice } from "@/lib/officeServer";
import OfficeDesk from "@/components/erp/office/OfficeDesk";
import NoAccess from "@/components/erp/NoAccess";

// Every employee's side of the executive office (components/erp/office/OfficeDesk.jsx).
export default async function OfficeDeskPage() {
  const user = await requireStaff();
  if (!user) return <NoAccess />;
  return <OfficeDesk tab="inbox" canUseOffice={canUseOffice(user)} />;
}
