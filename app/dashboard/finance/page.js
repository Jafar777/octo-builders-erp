import { getCurrentUser, hasPermission } from "@/lib/currentUser";
import FinanceCenter from "@/components/erp/finance/FinanceCenter";
import SalesOnly from "@/components/erp/sales/SalesOnly";
import NoAccess from "@/components/erp/NoAccess";

export default async function FinancePage() {
  const user = await getCurrentUser();
  if (!user?.isStaff) return <NoAccess />;
  if (hasPermission(user, "finance.view")) return <FinanceCenter />;
  // Someone who does sales without seeing the books gets only the sales part.
  if (!user.limited && hasPermission(user, "sales.manage")) return <SalesOnly />;
  return <NoAccess />;
}
