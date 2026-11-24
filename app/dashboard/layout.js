import { redirect } from "next/navigation";
import { getCurrentUser, publicUser } from "@/lib/currentUser";
import { isTrainingAdmin } from "@/lib/training";
import DashboardShell from "@/components/dashboard/DashboardShell";
import User from "@/models/User";
import Setting from "@/models/Setting";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  // The GM / CEO see a "Trainee" badge on the trainees everywhere.
  const traineeIds = isTrainingAdmin(user) ? (await User.find({ trainee: true }, { _id: 1 }).lean()).map((u) => u._id.toString()) : [];

  // The company's default look (the CEO sets it on the Appearance page).
  const companyAppearance = (await Setting.findOne({ key: "appearance" }, { value: 1 }).lean())?.value || null;

  return (
    <DashboardShell user={publicUser(user)} traineeIds={traineeIds} companyAppearance={companyAppearance}>
      {children}
    </DashboardShell>
  );
}
