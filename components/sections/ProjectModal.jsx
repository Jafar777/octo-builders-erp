"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export default function ProjectModal({ project, categories, onClose }) {
  const { t, lang, dir } = useLanguage();
  const images = [project.imageUrl, ...(project.gallery || [])].filter(Boolean);
  const [[index, direction], setSlide] = useState([0, 0]);

  const go = useCallback(
    (step) => {
      if (images.length < 2) return;
      setSlide(([i]) => [(i + step + images.length) % images.length, step]);
    },
    [images.length]
  );

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
      // Arrow keys follow the reading direction.
      if (e.key === "ArrowRight") go(dir === "rtl" ? -1 : 1);
      if (e.key === "ArrowLeft") go(dir === "rtl" ? 1 : -1);
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [go, onClose, dir]);

  const details = [
    ["location", project.location?.[lang]],
    ["year", project.year],
    ["area", project.area],
    ["style", project.style?.[lang]],
    ["client", project.client?.[lang]],
    ["designers", project.designers?.[lang]],
  ].filter(([, v]) => v);

  const projectCategories = categories.filter((c) => (project.categories || []).includes(c.key));
  const Prev = dir === "rtl" ? ChevronRight : ChevronLeft;
  const Next = dir === "rtl" ? ChevronLeft : ChevronRight;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-0 backdrop-blur-md sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={project.title?.[lang]}
    >
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.97 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-full w-full max-w-6xl flex-col overflow-hidden bg-brand-navy shadow-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-3xl sm:border sm:border-white/10 lg:flex-row"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("sections.close")}
          className="absolute end-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition-colors hover:bg-brand-orange"
        >
          <X size={20} />
        </button>

        <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-black lg:aspect-auto lg:min-h-[560px] lg:w-3/5">
          <AnimatePresence initial={false} custom={direction}>
            {images.length > 0 && (
              <motion.img
                key={index}
                src={images[index]}
                alt=""
                custom={direction}
                initial={{ opacity: 0, x: `${direction * (dir === "rtl" ? -8 : 8)}%` }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: `${direction * (dir === "rtl" ? 8 : -8)}%` }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0 h-full w-full object-contain"
              />
            )}
          </AnimatePresence>

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label={t("sections.previous")}
                className="absolute start-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition-colors hover:bg-brand-orange"
              >
                <Prev size={20} />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label={t("sections.next")}
                className="absolute end-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition-colors hover:bg-brand-orange"
              >
                <Next size={20} />
              </button>
              <div className="absolute inset-x-0 bottom-3 z-10 flex justify-center gap-1.5">
                {images.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSlide([i, i > index ? 1 : -1])}
                    aria-label={`${i + 1}`}
                    className={`h-1.5 rounded-full transition-all ${
                      i === index ? "w-6 bg-brand-orange" : "w-1.5 bg-white/50 hover:bg-white"
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 sm:p-8">
          {projectCategories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {projectCategories.map((c) => (
                <span key={c.key} className="rounded-full bg-brand-orange/15 px-3 py-1 text-xs font-medium text-brand-orange">
                  {c.name?.[lang]}
                </span>
              ))}
            </div>
          )}
          <h3 className="mt-4 text-2xl font-bold text-white sm:text-3xl">{project.title?.[lang]}</h3>
          <p className="mt-4 whitespace-pre-line leading-7 text-white/70">{project.description?.[lang]}</p>

          {details.length > 0 && (
            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-6">
              {details.map(([key, value]) => (
                <div key={key} className={key === "designers" ? "col-span-2" : ""}>
                  <dt className="text-xs uppercase tracking-wider text-white/40">{t(`sections.${key}`)}</dt>
                  <dd className="mt-1 text-sm text-white" dir={key === "area" ? "ltr" : undefined}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {project.link && (
            <a
              href={project.link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-orange px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-105"
            >
              {t("sections.visitLink")}
              <ExternalLink size={16} />
            </a>
          )}

          {images.length > 1 && (
            <div className="mt-6 grid grid-cols-4 gap-2">
              {images.map((src, i) => (
                <button
                  key={src + i}
                  type="button"
                  onClick={() => setSlide([i, i > index ? 1 : -1])}
                  className={`aspect-square overflow-hidden rounded-lg border-2 transition-colors ${
                    i === index ? "border-brand-orange" : "border-transparent opacity-60 hover:opacity-100"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
