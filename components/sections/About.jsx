"use client";

import { motion } from "framer-motion";
import { useLanguage } from "@/context/LanguageContext";

export default function About({ data }) {
  const { lang } = useLanguage();
  const title = data?.title?.[lang] || "";
  const body = data?.body?.[lang] || "";

  return (
    <section id="about" className="bg-brand-navy py-24 sm:py-32">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-2 lg:px-8">
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-brand-navy-light"
        >
          {data?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.imageUrl} alt={title} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-brand-navy-light to-brand-navy" />
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 40 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="text-3xl font-bold text-white sm:text-4xl">{title}</h2>
          <p className="mt-6 whitespace-pre-line text-lg leading-8 text-white/70">{body}</p>
        </motion.div>
      </div>
    </section>
  );
}
