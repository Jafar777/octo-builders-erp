import { getSiteContent, getServices, getProjects } from "@/lib/siteData";
import HashScrollHandler from "@/components/HashScrollHandler";
import Hero from "@/components/sections/Hero";
import About from "@/components/sections/About";
import Services from "@/components/sections/Services";
import Projects from "@/components/sections/Projects";
import Contact from "@/components/sections/Contact";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [content, services, projects] = await Promise.all([
    getSiteContent(),
    getServices(),
    getProjects(),
  ]);

  return (
    <>
      <HashScrollHandler />
      <Hero data={content.hero} />
      <About data={content.about} />
      <Services items={services} />
      <Projects items={projects} />
      <Contact data={content.contact} />
    </>
  );
}
