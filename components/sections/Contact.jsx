"use client";

import { motion } from "framer-motion";
import { AtSign, Globe, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { contactLinks } from "@/lib/contactLinks";

const ICONS = {
  email: Mail,
  phone: Phone,
  whatsapp: MessageCircle,
  website: Globe,
  instagram: AtSign,
  address: MapPin,
};

export default function Contact({ data }) {
  const { t, lang } = useLanguage();
  const title = data?.title?.[lang] || "";
  const body = data?.body?.[lang] || "";
  const items = contactLinks(data, lang);

  return (
    <section id="contact" className="relative overflow-hidden bg-brand-navy py-24 sm:py-32">
      <div className="pointer-events-none absolute -top-40 start-1/2 h-80 w-[40rem] -translate-x-1/2 rounded-full bg-brand-orange/10 blur-3xl rtl:translate-x-1/2" />
      <div className="relative mx-auto max-w-5xl px-6 text-center lg:px-8">
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
          className="mx-auto mt-4 max-w-2xl text-lg text-white/60"
        >
          {body}
        </motion.p>

        <div className="mt-12 flex flex-wrap justify-center gap-4">
          {items.map(({ key, value, href }, i) => {
            const Icon = ICONS[key];
            const Tag = href ? "a" : "div";
            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.6, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                className="w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.667rem)]"
              >
                <Tag
                  {...(href
                    ? { href, target: href.startsWith("http") ? "_blank" : undefined, rel: "noopener noreferrer" }
                    : {})}
                  className="group flex h-full items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-start transition-colors hover:border-brand-orange/40 hover:bg-white/[0.06]"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-orange/15 text-brand-orange transition-transform group-hover:scale-110">
                    <Icon size={20} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs uppercase tracking-wider text-white/40">
                      {t(`sections.${key}`)}
                    </span>
                    <span
                      className="mt-0.5 block truncate text-sm text-white"
                      dir={key === "address" ? undefined : "ltr"}
                    >
                      {value}
                    </span>
                  </span>
                </Tag>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
