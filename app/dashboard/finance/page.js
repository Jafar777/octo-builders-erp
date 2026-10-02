import { requirePermission } from "@/lib/currentUser";
import FinanceCenter from "@/components/erp/finance/FinanceCenter";
import NoAccess from "@/components/erp/NoAccess";

export default async function FinancePage() {
  if (!(await requirePermission("finance.view"))) return <NoAccess />;
  return <FinanceCenter />;
}
