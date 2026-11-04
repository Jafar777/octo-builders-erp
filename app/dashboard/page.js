import { redirect } from "next/navigation";
import { getCurrentUser, publicUser } from "@/lib/currentUser";
import DashboardOverview from "@/components/dashboard/DashboardOverview";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  // A restricted account (the GM by default) has no overview: it starts at the intake
  // forms when it has them, otherwise at its profile.
  if (user?.limited) redirect(!user.pages || user.pages.includes("intake") ? "/dashboard/intake" : "/dashboard/profile");
  return <DashboardOverview user={publicUser(user)} />;
}
