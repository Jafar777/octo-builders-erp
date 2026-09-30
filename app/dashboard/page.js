import { getSession } from "@/lib/auth";
import DashboardOverview from "@/components/dashboard/DashboardOverview";

export default async function DashboardPage() {
  const session = await getSession();
  return <DashboardOverview role={session?.role} />;
}
