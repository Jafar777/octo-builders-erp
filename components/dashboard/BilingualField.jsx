"use client";

import { useLanguage } from "@/context/LanguageContext";

export default function BilingualField({ label, value, onChange, textarea = false }) {
  const { t } = useLanguage();
  const Field = textarea ? "textarea" : "input";

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-white/70">{label}</label>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className="mb-1 block text-xs text-white/40">{t("common.arabic")}</span>
          <Field
            dir="rtl"
            rows={textarea ? 4 : undefined}
            value={value?.ar || ""}
            onChange={(e) => onChange({ ...value, ar: e.target.value })}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-white/30"
          />
        </div>
        <div>
          <span className="mb-1 block text-xs text-white/40">{t("common.english")}</span>
          <Field
            dir="ltr"
            rows={textarea ? 4 : undefined}
            value={value?.en || ""}
            onChange={(e) => onChange({ ...value, en: e.target.value })}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-white/30"
          />
        </div>
      </div>
    </div>
  );
}
