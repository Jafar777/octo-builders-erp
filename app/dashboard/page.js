import { getCurrentUser, publicUser } from "@/lib/currentUser";
import DashboardOverview from "@/components/dashboard/DashboardOverview";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  return <DashboardOverview user={publicUser(user)} />;
}
