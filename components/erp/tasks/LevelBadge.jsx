"use client";

import { useLanguage } from "@/context/LanguageContext";

// Which review a task waits for.
export default function LevelBadge({ level, onBehalf = false, className = "" }) {
  const { t } = useLanguage();
  if (!level) return null;
  const tone = { manager: "bg-sky-500/15 text-sky-200", gm: "bg-violet-500/15 text-violet-200", customer: "bg-amber-500/15 text-amber-200" }[level];
  return (
    <span className={`pointer-events-none rounded-full px-2 py-0.5 text-[11px] font-medium ${tone} ${className}`}>
      {t(`erp.reviews.level.${level}`)}
      {onBehalf ? ` · ${t("erp.reviews.onBehalf")}` : ""}
    </span>
  );
}
