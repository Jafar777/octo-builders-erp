"use client";

import { Timer } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { Select } from "@/components/erp/ui/fields";

// Project scale = the maximum working hours each task of the project may take
// (Settings → Tasks → Project scales).
export default function ScaleSelect({ scales = [], value, onChange }) {
  const { t, lang } = useLanguage();
  return (
    <div>
      <Select
        label={t("erp.scale.label")}
        value={value}
        onChange={onChange}
        placeholder="—"
        options={scales.map((s) => ({ value: s.key, label: `${s.name?.[lang]} — ${t("erp.scale.perTask", { h: s.hours })}` }))}
      />
      <p className="mt-1.5 text-xs text-white/40">{t("erp.scale.hint")}</p>
    </div>
  );
}

export function ScaleBadge({ scales = [], value }) {
  const { t, lang } = useLanguage();
  const scale = scales.find((s) => s.key === value);
  if (!scale) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs text-sky-200" title={t("erp.scale.label")}>
      <Timer size={12} /> {scale.name?.[lang]} · {t("erp.scale.perTask", { h: scale.hours })}
    </span>
  );
}
