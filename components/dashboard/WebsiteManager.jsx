"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/context/LanguageContext";
import HeroEditor from "@/components/dashboard/HeroEditor";
import StatsEditor from "@/components/dashboard/StatsEditor";
import AboutEditor from "@/components/dashboard/AboutEditor";
import ValuesEditor from "@/components/dashboard/ValuesEditor";
import ServicesEditor from "@/components/dashboard/ServicesEditor";
import ProcessEditor from "@/components/dashboard/ProcessEditor";
import ProjectsEditor from "@/components/dashboard/ProjectsEditor";
import ClientsEditor from "@/components/dashboard/ClientsEditor";
import ContactEditor from "@/components/dashboard/ContactEditor";

// Same order as the sections on the homepage.
const TABS = ["hero", "stats", "about", "values", "services", "process", "projects", "clients", "contact"];

export default function WebsiteManager({ content, services, projects }) {
  const { t } = useLanguage();
  const [tab, setTab] = useState("hero");

  return (
    <div>
      <h1 className="text-2xl font-bold">{t("dashboard.website")}</h1>

      <div className="relative mt-6 -mx-4 overflow-x-auto border-b border-white/10 px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-1">
          {TABS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className="relative whitespace-nowrap px-4 py-3 text-sm font-medium text-white/60 transition-colors data-[active=true]:text-white"
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
      </div>

      {/* Every editor stays mounted so unsaved and freshly saved edits survive tab switches. */}
      <div className="mt-8">
        {Object.entries({
          hero: <HeroEditor initial={content.hero} />,
          stats: <StatsEditor initial={content.stats} />,
          about: <AboutEditor initial={content.about} />,
          values: <ValuesEditor initial={content.values} />,
          services: <ServicesEditor section={content.services} initial={services} />,
          process: <ProcessEditor initial={content.process} />,
          projects: <ProjectsEditor section={content.projects} initial={projects} />,
          clients: <ClientsEditor initial={content.clients} />,
          contact: <ContactEditor initial={content.contact} />,
        }).map(([key, editor]) => (
          <div key={key} hidden={tab !== key}>
            {editor}
          </div>
        ))}
      </div>
    </div>
  );
}
