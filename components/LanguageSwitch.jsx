"use client";

import { motion } from "framer-motion";
import { useLanguage } from "@/context/LanguageContext";

export default function LanguageSwitch({ compact = false, groupId = "lang-pill" }) {
  const { lang, setLang } = useLanguage();

  return (
    <div
      className={`relative flex items-center rounded-full border border-white/20 bg-white/5 p-1 ${
        compact ? "text-xs" : "text-sm"
      }`}
      role="group"
      aria-label="Language switch"
    >
      {["ar", "en"].map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          className={`relative z-10 px-3 py-1 font-medium transition-colors duration-300 rounded-full ${
            lang === code ? "text-white" : "text-white/80 hover:text-white"
          }`}
        >
          {lang === code && (
            <motion.span
              layoutId={groupId}
              className="absolute inset-0 -z-10 rounded-full bg-brand-orange"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
          {code === "ar" ? "AR" : "EN"}
        </button>
      ))}
    </div>
  );
}
