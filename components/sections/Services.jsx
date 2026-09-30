"use client";

import { motion } from "framer-motion";
import { Hammer } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export default function Services({ items }) {
  const { t, lang } = useLanguage();

  return (
    <section id="services" className="bg-brand-navy-light py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.7 }}
          className="text-center text-3xl font-bold text-white sm:text-4xl"
        >
          {t("nav.services")}
        </motion.h2>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {(items || []).map((service, i) => (
            <motion.div
              key={service.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.6, delay: (i % 3) * 0.1 }}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
            >
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-white/10">
                {service.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={service.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Hammer size={24} className="text-white/80" />
                )}
              </div>
              <h3 className="mt-5 text-lg font-semibold text-white">{service.title?.[lang]}</h3>
              <p className="mt-2 text-sm leading-6 text-white/60">{service.description?.[lang]}</p>
            </motion.div>
          ))}
          {(!items || items.length === 0) && (
            <p className="col-span-full text-center text-white/40">—</p>
          )}
        </div>
      </div>
    </section>
  );
}
