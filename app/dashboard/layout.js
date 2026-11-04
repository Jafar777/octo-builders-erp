import { redirect } from "next/navigation";
import { getCurrentUser, publicUser } from "@/lib/currentUser";
import { isTrainingAdmin } from "@/lib/training";
import DashboardShell from "@/components/dashboard/DashboardShell";
import User from "@/models/User";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  // The GM / CEO see a "Trainee" badge on the trainees everywhere.
  const traineeIds = isTrainingAdmin(user) ? (await User.find({ trainee: true }, { _id: 1 }).lean()).map((u) => u._id.toString()) : [];

  return (
    <DashboardShell user={publicUser(user)} traineeIds={traineeIds}>
      {children}
    </DashboardShell>
  );
}
