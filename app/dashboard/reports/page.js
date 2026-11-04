import { requirePermission } from "@/lib/currentUser";
import ReportBuilder from "@/components/erp/reports/ReportBuilder";
import NoAccess from "@/components/erp/NoAccess";

export default async function ReportsPage() {
  const user = await requirePermission("reports.build");
  if (!user || user.limited) return <NoAccess />;
  return <ReportBuilder />;
}
