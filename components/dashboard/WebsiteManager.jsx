"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/context/LanguageContext";
import HeroEditor from "@/components/dashboard/HeroEditor";
import AboutEditor from "@/components/dashboard/AboutEditor";
import ServicesEditor from "@/components/dashboard/ServicesEditor";
import ProjectsEditor from "@/components/dashboard/ProjectsEditor";
import ContactEditor from "@/components/dashboard/ContactEditor";

const TABS = ["hero", "about", "services", "projects", "contact"];

export default function WebsiteManager({ content, services, projects }) {
  const { t } = useLanguage();
  const [tab, setTab] = useState("hero");

  return (
    <div>
      <h1 className="text-2xl font-bold">{t("dashboard.website")}</h1>

      <div className="relative mt-6 flex flex-wrap gap-1 border-b border-white/10 pb-0">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className="relative px-4 py-3 text-sm font-medium text-white/60 transition-colors data-[active=true]:text-white"
            data-active={tab === key}
          >
            {t(`dashboard.${key}`)}
            {tab === key && (
              <motion.span
                layoutId="website-tab-underline"
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-orange"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {tab === "hero" && <HeroEditor initial={content.hero} />}
        {tab === "about" && <AboutEditor initial={content.about} />}
        {tab === "services" && <ServicesEditor initial={services} />}
        {tab === "projects" && <ProjectsEditor initial={projects} />}
        {tab === "contact" && <ContactEditor initial={content.contact} />}
      </div>
    </div>
  );
}
