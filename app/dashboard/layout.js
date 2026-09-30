import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import DashboardShell from "@/components/dashboard/DashboardShell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }) {
  const session = await getSession();
  if (!session) redirect("/auth");

  await connectDB();
  const userDoc = await User.findById(session.sub).lean();
  if (!userDoc) redirect("/auth");

  const user = {
    id: userDoc._id.toString(),
    email: userDoc.email,
    name: userDoc.name,
    avatarUrl: userDoc.avatarUrl,
    role: userDoc.role,
  };

  return <DashboardShell user={user}>{children}</DashboardShell>;
}
