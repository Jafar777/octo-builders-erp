import { requirePermission } from "@/lib/currentUser";
import { getSiteContent, getServices, getProjects } from "@/lib/siteData";
import WebsiteManager from "@/components/dashboard/WebsiteManager";
import NoAccess from "@/components/erp/NoAccess";

export default async function WebsitePage() {
  if (!(await requirePermission("website.manage"))) return <NoAccess />;

  const [content, services, projects] = await Promise.all([
    getSiteContent(),
    getServices(),
    getProjects(),
  ]);

  return <WebsiteManager content={content} services={services} projects={projects} />;
}
