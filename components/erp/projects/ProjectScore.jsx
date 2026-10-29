"use client";

import { useLanguage } from "@/context/LanguageContext";

// Project KPI (delivery, schedule vs Baseline 1, quality, cost) with its parts in the tooltip.
export default function ProjectScore({ kpi }) {
  const { t } = useLanguage();
  if (!kpi || kpi.score === null) return <span className="text-xs text-white/35">—</span>;
  const tone = kpi.score >= 80 ? "text-emerald-300" : kpi.score >= 60 ? "text-amber-300" : "text-red-300";
  const parts = ["delivery", "schedule", "quality", "cost"].filter((k) => kpi[k] !== null).map((k) => `${t(`erp.analytics.kpiPart.${k}`)}: ${kpi[k]}`);
  return (
    <span className={`text-sm font-semibold tabular-nums ${tone}`} title={parts.join(" · ")}>
      {kpi.score}
    </span>
  );
}
