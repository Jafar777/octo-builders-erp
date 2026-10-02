import { requirePermission } from "@/lib/currentUser";
import Analytics from "@/components/erp/analytics/Analytics";
import NoAccess from "@/components/erp/NoAccess";

export default async function AnalyticsPage() {
  const user = await requirePermission("analytics.view");
  if (!user?.isStaff) return <NoAccess />;
  return <Analytics />;
}
