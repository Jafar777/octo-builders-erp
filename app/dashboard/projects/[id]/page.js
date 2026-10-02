import { requireStaff } from "@/lib/currentUser";
import ProjectBoard from "@/components/erp/projects/ProjectBoard";
import NoAccess from "@/components/erp/NoAccess";

export default async function ProjectPage({ params }) {
  if (!(await requireStaff())) return <NoAccess />;
  const { id } = await params;
  return <ProjectBoard projectId={id} />;
}
