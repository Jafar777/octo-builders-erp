import { getCurrentUser, hasPermission } from "@/lib/currentUser";
import PricingCalculator from "@/components/erp/finance/PricingCalculator";
import NoAccess from "@/components/erp/NoAccess";

// Stand-alone calculator for people who price work without seeing the books.
export default async function PricingPage() {
  const user = await getCurrentUser();
  if (!hasPermission(user, "pricing.use") && !hasPermission(user, "finance.view")) return <NoAccess />;
  return <PricingCalculator />;
}
