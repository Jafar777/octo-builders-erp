import { requireStaff } from "@/lib/currentUser";
import ProjectsList from "@/components/erp/projects/ProjectsList";
import NoAccess from "@/components/erp/NoAccess";

export default async function ProjectsPage() {
  if (!(await requireStaff())) return <NoAccess />;
  return <ProjectsList />;
}
