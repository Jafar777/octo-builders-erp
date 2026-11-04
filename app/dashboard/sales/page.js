import { requirePermission } from "@/lib/currentUser";
import SalesCenter from "@/components/erp/sales/SalesCenter";
import NoAccess from "@/components/erp/NoAccess";

export default async function SalesPage() {
  const user = await requirePermission("sales.manage");
  if (!user || user.limited) return <NoAccess />;
  return <SalesCenter />;
}
