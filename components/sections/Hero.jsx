"use client";

import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { scrollToSection } from "@/lib/scrollNav";

export default function Hero({ data }) {
  const { t, lang } = useLanguage();
  const title = data?.title?.[lang] || "";
  const subtitle = data?.subtitle?.[lang] || "";
  const hasVideo = data?.mediaType === "video" && data?.mediaUrl;
  const hasImage = data?.mediaType === "image" && data?.mediaUrl;

  return (
    <section id="hero" className="relative flex h-screen min-h-[640px] w-full items-center justify-center overflow-hidden bg-brand-navy-light">
      <div className="absolute inset-0">
        {hasVideo ? (
          <video
            src={data.mediaUrl}
            autoPlay
            muted
            loop
            playsInline
            className="h-full w-full object-cover animate-kenburns"
          />
        ) : hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.mediaUrl} alt="" className="h-full w-full object-cover animate-kenburns" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-brand-navy-light via-brand-navy to-black" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/60" />
      </div>

      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.18, delayChildren: 0.2 } },
        }}
        className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-6 text-center"
      >
        <motion.h1
          variants={{
            hidden: { opacity: 0, y: 40 },
            show: { opacity: 1, y: 0, transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] } },
          }}
          className="text-4xl font-extrabold leading-tight text-white drop-shadow-lg sm:text-5xl md:text-6xl"
        >
          {title}
        </motion.h1>
        <motion.p
          variants={{
            hidden: { opacity: 0, y: 30 },
            show: { opacity: 1, y: 0, transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] } },
          }}
          className="mt-6 max-w-2xl text-lg text-white/80 sm:text-xl"
        >
          {subtitle}
        </motion.p>
      </motion.div>

      <motion.button
        type="button"
        onClick={() => scrollToSection("about")}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.8 }}
        aria-label={t("nav.about")}
        className="absolute bottom-24 left-1/2 -translate-x-1/2 text-white/70 transition-colors hover:text-white"
      >
        <ChevronDown size={28} className="animate-bounce-y" />
      </motion.button>
    </section>
  );
}
