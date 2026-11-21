"use client";

import { ArrowDownUp, Search, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

// A search box and a "sort by" picker for list pages that aren't tables (cards, rows).

// Does `q` match any of the texts? Case- and spacing-insensitive, every word must match.
export function matches(q, ...texts) {
  const words = String(q || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = texts.flat().filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function SearchBox({ value, onChange, placeholder, className = "w-56" }) {
  const { t } = useLanguage();
  return (
    <label className={`flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 ${className}`}>
      <Search size={15} className="shrink-0 text-white/50" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || t("erp.ux.searchList")} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="clear" className="text-white/50 hover:text-white">
          <X size={14} />
        </button>
      )}
    </label>
  );
}

// options: [[value, label]]
export function SortSelect({ value, onChange, options }) {
  const { t } = useLanguage();
  return (
    <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm" title={t("erp.ux.sortBy")}>
      <ArrowDownUp size={15} className="shrink-0 text-white/50" />
      <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-transparent text-sm outline-none [&>option]:bg-black">
        {options.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

// Sorts a copy of `list` by one of the named comparators ("" = as it came).
export function sortList(list, key, comparators) {
  const cmp = comparators[key];
  return cmp ? [...list].sort(cmp) : list;
}
