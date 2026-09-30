"use client";

import { useLanguage } from "@/context/LanguageContext";
import BilingualField from "@/components/dashboard/BilingualField";

export default function SectionHeadingFields({ value, onChange }) {
  const { t } = useLanguage();

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">{t("dashboard.sectionHeading")}</h3>
      <BilingualField label={t("dashboard.title")} value={value.title} onChange={(title) => onChange({ ...value, title })} />
      <BilingualField
        label={t("dashboard.subtitle")}
        value={value.subtitle}
        onChange={(subtitle) => onChange({ ...value, subtitle })}
      />
    </div>
  );
}
