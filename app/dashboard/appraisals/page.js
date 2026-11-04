import { requireStaff } from "@/lib/currentUser";
import AppraisalsCenter from "@/components/erp/appraisals/AppraisalsCenter";
import NoAccess from "@/components/erp/NoAccess";

export default async function AppraisalsPage() {
  if (!(await requireStaff())) return <NoAccess />;
  return <AppraisalsCenter />;
}
