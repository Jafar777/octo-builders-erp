"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, Image as ImageIcon } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export default function Projects({ items }) {
  const { t, lang } = useLanguage();

  return (
    <section id="projects" className="bg-brand-navy py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.7 }}
          className="text-center text-3xl font-bold text-white sm:text-4xl"
        >
          {t("nav.projects")}
        </motion.h2>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {(items || []).map((project, i) => {
            const Wrapper = project.link ? motion.a : motion.div;
            const wrapperProps = project.link
              ? { href: project.link, target: "_blank", rel: "noopener noreferrer" }
              : {};
            return (
              <Wrapper
                key={project.id}
                {...wrapperProps}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.6, delay: (i % 3) * 0.1 }}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-brand-navy-light"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-brand-navy-light">
                  {project.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={project.imageUrl}
                      alt={project.title?.[lang] || ""}
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageIcon size={32} className="text-white/30" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                  {project.link && (
                    <span className="absolute end-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-brand-orange text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <ArrowUpRight size={18} />
                    </span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 p-5">
                    <h3 className="text-lg font-semibold text-white">{project.title?.[lang]}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-white/70">{project.description?.[lang]}</p>
                  </div>
                </div>
              </Wrapper>
            );
          })}
          {(!items || items.length === 0) && (
            <p className="col-span-full text-center text-white/40">—</p>
          )}
        </div>
      </div>
    </section>
  );
}
