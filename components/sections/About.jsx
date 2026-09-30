"use client";

import { motion } from "framer-motion";
import { Eye, Target } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export default function About({ data }) {
  const { t, lang, dir } = useLanguage();
  const title = data?.title?.[lang] || "";
  const body = data?.body?.[lang] || "";
  const side = dir === "rtl" ? -1 : 1;

  const pillars = [
    { key: "vision", icon: Eye, text: data?.vision?.[lang] },
    { key: "mission", icon: Target, text: data?.mission?.[lang] },
  ].filter((p) => p.text);

  return (
    <section id="about" className="bg-brand-navy py-24 sm:py-32">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-2 lg:px-8">
        <motion.div
          initial={{ opacity: 0, x: -40 * side }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-brand-navy-light">
            {data?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.imageUrl} alt={title} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-brand-navy-light to-brand-navy" />
            )}
          </div>
          <div className="absolute -bottom-4 -end-4 -z-0 hidden h-32 w-32 rounded-3xl border-2 border-brand-orange/60 sm:block" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 40 * side }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="text-3xl font-bold text-white sm:text-4xl">{title}</h2>
          <span className="mt-4 block h-0.5 w-16 rounded-full bg-brand-orange" />
          <p className="mt-6 whitespace-pre-line text-lg leading-8 text-white/70">{body}</p>
        </motion.div>
      </div>

      {pillars.length > 0 && (
        <div className="mx-auto mt-16 grid max-w-7xl gap-6 px-6 md:grid-cols-2 lg:px-8">
          {pillars.map(({ key, icon: Icon, text }, i) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.7, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
              className="group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.01] p-8 transition-colors hover:border-brand-orange/40"
            >
              <div className="absolute -end-10 -top-10 h-40 w-40 rounded-full bg-brand-orange/10 blur-2xl transition-opacity group-hover:opacity-100 sm:opacity-60" />
              <div className="relative flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-orange/15 text-brand-orange">
                  <Icon size={22} />
                </span>
                <h3 className="text-xl font-semibold text-white">{t(`sections.${key}`)}</h3>
              </div>
              <p className="relative mt-5 leading-7 text-white/70">{text}</p>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}
