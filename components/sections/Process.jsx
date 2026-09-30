"use client";

import { useRef } from "react";
import { motion, useScroll, useSpring } from "framer-motion";
import { useLanguage } from "@/context/LanguageContext";
import SectionHeader from "@/components/sections/SectionHeader";

export default function Process({ data }) {
  const { t, lang } = useLanguage();
  const items = data?.items || [];
  const listRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: listRef, offset: ["start 75%", "end 60%"] });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });

  if (items.length === 0) return null;

  return (
    <section id="process" className="bg-brand-navy-light py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6 lg:px-8">
        <SectionHeader title={data.title} subtitle={data.subtitle} />

        <ol ref={listRef} className="relative mt-16">
          {/* Timeline rail; the orange part fills as the visitor scrolls. */}
          <div className="absolute inset-y-0 start-6 w-px bg-white/10 md:start-1/2" />
          <motion.div
            style={{ scaleY: progress }}
            className="absolute inset-y-0 start-6 w-px origin-top bg-brand-orange md:start-1/2"
          />

          {items.map((step, i) => {
            const even = i % 2 === 0;
            return (
              <li key={i} className="relative mb-10 last:mb-0 md:grid md:grid-cols-2 md:gap-16">
                <motion.span
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true, amount: 0.8 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="absolute start-6 top-4 z-10 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border-2 border-brand-orange bg-brand-navy text-sm font-bold text-white md:start-1/2 rtl:translate-x-1/2"
                >
                  {i + 1}
                </motion.span>

                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  className={`ms-16 rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:ms-0 ${
                    even ? "md:col-start-1 md:text-end" : "md:col-start-2"
                  }`}
                >
                  <span className="text-xs font-semibold uppercase tracking-wider text-brand-orange">
                    {t("sections.step")} {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-2 text-lg font-semibold text-white">{step.title?.[lang]}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/60">{step.description?.[lang]}</p>
                </motion.div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
