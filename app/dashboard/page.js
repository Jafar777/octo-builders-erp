import { redirect } from "next/navigation";
import { getCurrentUser, publicUser } from "@/lib/currentUser";
import DashboardOverview from "@/components/dashboard/DashboardOverview";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  // The general manager has no overview: their dashboard starts at the intake forms.
  if (user?.limited) redirect("/dashboard/intake");
  return <DashboardOverview user={publicUser(user)} />;
}
