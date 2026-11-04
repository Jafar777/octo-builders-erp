"use client";

import { useLanguage } from "@/context/LanguageContext";

// Toggle chips for picking categories by key. The caller decides whether one
// or several may be selected.
export default function CategorySelect({ categories, value, onChange, label }) {
  const { t, lang } = useLanguage();

  function toggle(key) {
    onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  }

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-white/70">{label || t("dashboard.category")}</label>
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => toggle(c.key)}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
              value.includes(c.key)
                ? "bg-brand-orange text-white"
                : "border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
            }`}
          >
            {c.name?.[lang] || c.name?.ar || c.name?.en || "—"}
          </button>
        ))}
        {categories.length === 0 && <span className="text-sm text-white/60">{t("dashboard.uncategorized")}</span>}
      </div>
    </div>
  );
}
