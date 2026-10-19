import { requireStaff } from "@/lib/currentUser";
import { canRouteStages } from "@/lib/projects";
import TaskLog from "@/components/erp/tasks/TaskLog";
import NoAccess from "@/components/erp/NoAccess";

// GM / CEO only.
export default async function TaskLogPage() {
  const user = await requireStaff();
  if (!user || !canRouteStages(user)) return <NoAccess />;
  return <TaskLog />;
}
