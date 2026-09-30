"use client";

import { motion } from "framer-motion";
import { Award } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { getIcon } from "@/lib/icons";
import SectionHeader from "@/components/sections/SectionHeader";

export default function Values({ data }) {
  const { lang } = useLanguage();
  const items = data?.items || [];
  if (items.length === 0) return null;

  return (
    <section id="values" className="bg-brand-navy-light py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <SectionHeader title={data.title} subtitle={data.subtitle} />

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => {
            const Icon = getIcon(item.icon, Award);
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30, scale: 0.97 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.6, delay: (i % 3) * 0.1, ease: [0.22, 1, 0.36, 1] }}
                className="group relative rounded-2xl border border-white/10 bg-white/[0.03] p-7 transition-all duration-300 hover:-translate-y-1 hover:border-brand-orange/40 hover:bg-white/[0.06]"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-orange/15 text-brand-orange transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
                  <Icon size={22} />
                </span>
                <h3 className="mt-5 text-lg font-semibold text-white">{item.title?.[lang]}</h3>
                <p className="mt-2 text-sm leading-6 text-white/60">{item.description?.[lang]}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
