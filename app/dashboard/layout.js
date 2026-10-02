import { redirect } from "next/navigation";
import { getCurrentUser, publicUser } from "@/lib/currentUser";
import DashboardShell from "@/components/dashboard/DashboardShell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  return <DashboardShell user={publicUser(user)}>{children}</DashboardShell>;
}
