import { requirePermission } from "@/lib/currentUser";
import TemplatesManager from "@/components/erp/projects/TemplatesManager";
import NoAccess from "@/components/erp/NoAccess";

export default async function TemplatesPage() {
  if (!(await requirePermission("projects.manage"))) return <NoAccess />;
  return <TemplatesManager />;
}
