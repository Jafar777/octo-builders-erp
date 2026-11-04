import { Suspense } from "react";
import { getCurrentUser, hasPermission } from "@/lib/currentUser";
import PurchasingCenter from "@/components/erp/purchasing/PurchasingCenter";
import NoAccess from "@/components/erp/NoAccess";

export default async function PurchasingPage() {
  const user = await getCurrentUser();
  if (!user?.isStaff || user.limited || !["purchasing.request", "purchasing.approve", "assets.manage"].some((p) => hasPermission(user, p))) return <NoAccess />;
  return (
    <Suspense>
      <PurchasingCenter />
    </Suspense>
  );
}
