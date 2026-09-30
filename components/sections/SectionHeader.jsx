"use client";

import { motion } from "framer-motion";
import { useLanguage } from "@/context/LanguageContext";

export default function SectionHeader({ title, subtitle }) {
  const { lang } = useLanguage();
  const titleText = title?.[lang] || "";
  const subtitleText = subtitle?.[lang] || "";

  return (
    <div className="mx-auto max-w-2xl text-center">
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="text-3xl font-bold text-white sm:text-4xl"
      >
        {titleText}
      </motion.h2>
      <motion.span
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto mt-4 block h-0.5 w-16 origin-center rounded-full bg-brand-orange"
      />
      {subtitleText && (
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="mt-5 text-lg text-white/60"
        >
          {subtitleText}
        </motion.p>
      )}
    </div>
  );
}
