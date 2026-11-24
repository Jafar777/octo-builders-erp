import { redirect } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/currentUser";
import { canOpenPath } from "@/lib/pageAccess";

// Moved: asking and approving are on the Requests page; the purchase record, suppliers and
// assets are in Finance (on the Requests page for those who don't open Finance).
export default async function Purchasing({ searchParams }) {
  const { tab } = await searchParams;
  const user = await getCurrentUser();
  const record = ["all", "suppliers", "assets"].includes(tab);
  if (record && hasPermission(user, "finance.view") && canOpenPath(user, "/dashboard/finance")) redirect(`/dashboard/finance?tab=purchases&view=${tab}`);
  redirect(`/dashboard/orders?type=purchase${record || ["mine", "queue"].includes(tab) ? `&tab=${tab}` : ""}`);
}
