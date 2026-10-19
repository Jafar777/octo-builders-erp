import { requireStaff } from "@/lib/currentUser";
import TeamTasks from "@/components/erp/tasks/TeamTasks";
import NoAccess from "@/components/erp/NoAccess";

export default async function TeamTasksPage() {
  const user = await requireStaff();
  if (!user) return <NoAccess />;
  return <TeamTasks meId={user.id} />;
}
