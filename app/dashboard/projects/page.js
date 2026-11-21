import { getCurrentUser, requireStaff } from "@/lib/currentUser";
import { canUseIntake } from "@/lib/intake";
import ProjectsList from "@/components/erp/projects/ProjectsList";
import NoAccess from "@/components/erp/NoAccess";

export default async function ProjectsPage() {
  if (!(await requireStaff())) return <NoAccess />;
  const user = await getCurrentUser();
  // The Intakes button: people who may use intake forms and weren't denied that page.
  const intakes = canUseIntake(user) && (!user.pages || user.pages.includes("intake"));
  return <ProjectsList intakes={intakes} />;
}
