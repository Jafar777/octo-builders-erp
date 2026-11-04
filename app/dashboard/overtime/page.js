import { requireStaff } from "@/lib/currentUser";
import OvertimeRequests from "@/components/erp/hr/OvertimeRequests";
import NoAccess from "@/components/erp/NoAccess";

// Every employee asks for overtime here (for today); department managers and the CEO decide.
export default async function Overtime() {
  const user = await requireStaff();
  if (!user) return <NoAccess />;
  return <OvertimeRequests />;
}
