import { Suspense } from "react";
import { requireStaff } from "@/lib/currentUser";
import OrdersCenter from "@/components/erp/orders/OrdersCenter";
import NoAccess from "@/components/erp/NoAccess";

// Leave, overtime and purchase requests: ask here, answer here.
export default async function OrdersPage() {
  if (!(await requireStaff())) return <NoAccess />;
  return (
    <Suspense>
      <OrdersCenter />
    </Suspense>
  );
}
