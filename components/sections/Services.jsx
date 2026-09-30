"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Hammer } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { getIcon } from "@/lib/icons";
import SectionHeader from "@/components/sections/SectionHeader";

export default function Services({ data, items }) {
  const { t, lang } = useLanguage();
  const services = useMemo(() => items || [], [items]);

  // Only show category tabs that actually have services, plus "all".
  const categories = useMemo(() => {
    const used = new Set(services.map((s) => s.category));
    return (data?.categories || []).filter((c) => used.has(c.key));
  }, [data, services]);

  const [active, setActive] = useState("all");
  const visible = active === "all" ? services : services.filter((s) => s.category === active);
  const tabs = categories.length > 1 ? [{ key: "all", name: null }, ...categories] : [];

  return (
    <section id="services" className="bg-brand-navy py-24 sm:py-32">
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
                    layoutId="services-tab-pill"
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
            {visible.map((service, i) => {
              const Icon = getIcon(service.icon, Hammer);
              const category = categories.find((c) => c.key === service.category);
              return (
                <motion.div
                  layout
                  key={service.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.5, delay: (i % 3) * 0.06, ease: [0.22, 1, 0.36, 1] }}
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-brand-orange/40 hover:bg-white/[0.06]"
                >
                  <div className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-brand-orange transition-transform duration-500 group-hover:scale-x-100 rtl:origin-right" />
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/10 text-white/80 transition-colors group-hover:bg-brand-orange/15 group-hover:text-brand-orange">
                      {service.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={service.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Icon size={24} />
                      )}
                    </div>
                    {category && (
                      <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/50">
                        {category.name?.[lang]}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-white">{service.title?.[lang]}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/60">{service.description?.[lang]}</p>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {services.length === 0 && <p className="col-span-full text-center text-white/40">—</p>}
        </motion.div>
      </div>
    </section>
  );
}
