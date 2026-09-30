"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Image as ImageIcon, MapPin } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import SectionHeader from "@/components/sections/SectionHeader";
import ProjectModal from "@/components/sections/ProjectModal";

export default function Projects({ data, items }) {
  const { t, lang } = useLanguage();
  const projects = useMemo(() => items || [], [items]);

  const categories = useMemo(() => {
    const used = new Set(projects.flatMap((p) => p.categories || []));
    return (data?.categories || []).filter((c) => used.has(c.key));
  }, [data, projects]);

  const [active, setActive] = useState("all");
  const [openId, setOpenId] = useState(null);
  const visible =
    active === "all" ? projects : projects.filter((p) => (p.categories || []).includes(active));
  const tabs = categories.length > 1 ? [{ key: "all", name: null }, ...categories] : [];
  const openProject = projects.find((p) => p.id === openId);

  return (
    <section id="projects" className="bg-brand-navy py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <SectionHeader title={data?.title} subtitle={data?.subtitle} />

        {tabs.length > 0 && (
          <div className="mt-10 flex flex-wrap justify-center gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActive(tab.key)}
                className="relative rounded-full px-5 py-2 text-sm font-medium text-white/70 transition-colors hover:text-white data-[active=true]:text-white"
                data-active={active === tab.key}
              >
                {active === tab.key && (
                  <motion.span
                    layoutId="projects-tab-pill"
                    className="absolute inset-0 rounded-full bg-brand-orange"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative">{tab.name ? tab.name[lang] : t("sections.all")}</span>
              </button>
            ))}
          </div>
        )}

        <motion.div layout className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {visible.map((project, i) => (
              <motion.button
                layout
                type="button"
                key={project.id}
                onClick={() => setOpenId(project.id)}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.5, delay: (i % 3) * 0.06, ease: [0.22, 1, 0.36, 1] }}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-brand-navy-light text-start"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-brand-navy-light">
                  {project.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={project.imageUrl}
                      alt={project.title?.[lang] || ""}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageIcon size={32} className="text-white/30" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                  <span className="absolute end-4 top-4 flex h-9 w-9 translate-y-2 items-center justify-center rounded-full bg-brand-orange text-white opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                    <ArrowUpRight size={18} className="rtl:-scale-x-100" />
                  </span>
                  {project.year && (
                    <span className="absolute start-4 top-4 rounded-full bg-black/40 px-3 py-1 text-xs text-white/80 backdrop-blur">
                      {project.year}
                    </span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 p-5">
                    <h3 className="text-lg font-semibold text-white">{project.title?.[lang]}</h3>
                    {project.location?.[lang] && (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-white/70">
                        <MapPin size={14} className="shrink-0 text-brand-orange" />
                        {project.location[lang]}
                      </p>
                    )}
                  </div>
                </div>
              </motion.button>
            ))}
          </AnimatePresence>
          {projects.length === 0 && <p className="col-span-full text-center text-white/40">—</p>}
        </motion.div>
      </div>

      <AnimatePresence>
        {openProject && (
          <ProjectModal
            key={openProject.id}
            project={openProject}
            categories={data?.categories || []}
            onClose={() => setOpenId(null)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
