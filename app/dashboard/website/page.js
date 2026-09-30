import { getSession } from "@/lib/auth";
import { getSiteContent, getServices, getProjects } from "@/lib/siteData";
import WebsiteManager from "@/components/dashboard/WebsiteManager";

export default async function WebsitePage() {
  const session = await getSession();

  if (session?.role !== "admin") {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-white/60">
        Admins only.
      </div>
    );
  }

  const [content, services, projects] = await Promise.all([
    getSiteContent(),
    getServices(),
    getProjects(),
  ]);

  return <WebsiteManager content={content} services={services} projects={projects} />;
}
