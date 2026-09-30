"use client";

import { motion } from "framer-motion";
import { Mail, Phone, MapPin } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export default function Contact({ data }) {
  const { lang } = useLanguage();
  const title = data?.title?.[lang] || "";
  const body = data?.body?.[lang] || "";

  const items = [
    { icon: Mail, value: data?.email, href: data?.email ? `mailto:${data.email}` : null },
    { icon: Phone, value: data?.phone, href: data?.phone ? `tel:${data.phone}` : null },
    { icon: MapPin, value: data?.address?.[lang], href: null },
  ].filter((i) => i.value);

  return (
    <section id="contact" className="bg-brand-navy-light py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-6 text-center lg:px-8">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.7 }}
          className="text-3xl font-bold text-white sm:text-4xl"
        >
          {title}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="mt-4 text-lg text-white/60"
        >
          {body}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          {items.map(({ icon: Icon, value, href }, i) => {
            const content = (
              <>
                <Icon size={18} className="text-white/50" />
                <span>{value}</span>
              </>
            );
            return href ? (
              <a
                key={i}
                href={href}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-white/80 transition-colors hover:border-white/30 hover:text-white"
              >
                {content}
              </a>
            ) : (
              <span
                key={i}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-white/80"
              >
                {content}
              </span>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
