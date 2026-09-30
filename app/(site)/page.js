import { getSiteContent, getServices, getProjects } from "@/lib/siteData";
import HashScrollHandler from "@/components/HashScrollHandler";
import Hero from "@/components/sections/Hero";
import Stats from "@/components/sections/Stats";
import About from "@/components/sections/About";
import Values from "@/components/sections/Values";
import Services from "@/components/sections/Services";
import Process from "@/components/sections/Process";
import Projects from "@/components/sections/Projects";
import Clients from "@/components/sections/Clients";
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
      <Stats data={content.stats} />
      <About data={content.about} />
      <Values data={content.values} />
      <Services data={content.services} items={services} />
      <Process data={content.process} />
      <Projects data={content.projects} items={projects} />
      <Clients data={content.clients} />
      <Contact data={content.contact} />
    </>
  );
}
