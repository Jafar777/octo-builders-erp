"use client";

import { Check, Loader2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export default function SaveBar({ status, error, onSave, label, small = false }) {
  const { t } = useLanguage();
  const iconSize = small ? 14 : 16;

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
      <button
        type="button"
        onClick={onSave}
        disabled={status === "saving"}
        className={`flex items-center gap-2 rounded-xl bg-brand-orange font-semibold text-white transition-transform hover:scale-[1.01] disabled:opacity-60 ${
          small ? "px-5 py-2.5 text-sm" : "px-6 py-3 text-sm"
        }`}
      >
        {status === "saving" && <Loader2 size={iconSize} className="animate-spin" />}
        {status === "saved" && <Check size={iconSize} />}
        {status === "saved" ? t("common.saved") : label || t("common.save")}
      </button>
    </div>
  );
}
