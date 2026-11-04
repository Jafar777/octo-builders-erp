"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { locale } from "@/lib/formatTime";

export const DAY_STYLE = {
  present: "text-emerald-300",
  absent: "bg-red-500/10 text-red-300",
  weekend: "bg-white/[0.04] text-white/60",
  holiday: "bg-white/[0.04] text-sky-300",
  annual_leave: "bg-sky-500/10 text-sky-300",
  sick_leave: "bg-sky-500/10 text-sky-300",
  unpaid_leave: "bg-amber-500/10 text-amber-300",
  justified_absence: "bg-amber-500/10 text-amber-300",
  upcoming: "text-white/50",
  not_employed: "text-white/60",
  exempt: "text-white/55",
};

// 7.5 → "7:30"
export function hm(hours) {
  if (hours === null || hours === undefined) return "—";
  const total = Math.round(Math.abs(hours) * 60);
  return `${hours < 0 ? "-" : ""}${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// Wrapped in a left-to-right isolate (U+2066…U+2069) so Arabic pages don't
// reorder "US$ -500.00" into "-500.00 US$".
export function money(value, currency, lang) {
  if (value === null || value === undefined) return "—";
  let text;
  try {
    text = new Intl.NumberFormat(locale(lang), { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    text = `${value.toFixed(2)} ${currency}`;
  }
  return `⁦${text}⁩`;
}

export function shiftMonth(month, n) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

export function monthLabel(month, lang) {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale(lang), { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function MonthPicker({ month, onChange }) {
  const { lang } = useLanguage();
  const Prev = lang === "ar" ? ChevronRight : ChevronLeft;
  const Next = lang === "ar" ? ChevronLeft : ChevronRight;
  return (
    <div className="flex items-center gap-1 rounded-xl border border-white/10 p-1">
      <button type="button" onClick={() => onChange(shiftMonth(month, -1))} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10" aria-label="previous month">
        <Prev size={16} />
      </button>
      <span className="min-w-36 text-center text-sm font-medium">{monthLabel(month, lang)}</span>
      <button type="button" onClick={() => onChange(shiftMonth(month, 1))} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10" aria-label="next month">
        <Next size={16} />
      </button>
    </div>
  );
}

export function StatTile({ label, value, hint, tone = "" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs text-white/50">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-white/60">{hint}</p>}
    </div>
  );
}
