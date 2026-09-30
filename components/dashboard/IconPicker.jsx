"use client";

import { useLanguage } from "@/context/LanguageContext";
import { ICONS } from "@/lib/icons";

export default function IconPicker({ value, onChange }) {
  const { t } = useLanguage();

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-white/70">{t("dashboard.icon")}</label>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(ICONS).map(([key, Icon]) => (
          <button
            key={key}
            type="button"
            title={key}
            onClick={() => onChange(key)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
              value === key
                ? "border-brand-orange bg-brand-orange/20 text-brand-orange"
                : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon size={16} />
          </button>
        ))}
      </div>
    </div>
  );
}
