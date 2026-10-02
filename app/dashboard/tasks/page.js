import { requireStaff } from "@/lib/currentUser";
import MyTasks from "@/components/erp/tasks/MyTasks";
import NoAccess from "@/components/erp/NoAccess";

export default async function TasksPage() {
  const user = await requireStaff();
  if (!user) return <NoAccess />;
  return <MyTasks meId={user.id} />;
}
