import { requirePermission } from "@/lib/currentUser";
import RecruitmentCenter from "@/components/erp/recruitment/RecruitmentCenter";
import NoAccess from "@/components/erp/NoAccess";

export default async function RecruitmentPage() {
  const user = await requirePermission("recruitment.manage");
  if (!user || user.limited) return <NoAccess />;
  return <RecruitmentCenter />;
}
