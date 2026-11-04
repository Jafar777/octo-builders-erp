"use client";

import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Label } from "@/components/erp/ui/fields";

// Money helpers for the intake form. Rates come from Settings → currencies: `rate` is how
// many units of a currency equal 1 unit of the base currency (USD 1, SAR 3.8…).

const SYMBOLS = { USD: "$", SAR: "ر.س", EUR: "€", GBP: "£", AED: "د.إ", TRY: "₺", SYP: "ل.س" };

// The currency's symbol ($, ر.س…); its code when it has none.
export function currencySymbol(code, lang = "ar") {
  if (!code) return "";
  if (SYMBOLS[code]) return SYMBOLS[code];
  try {
    const part = new Intl.NumberFormat(lang === "ar" ? "ar" : "en", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part?.value || code;
  } catch {
    return code;
  }
}

// "1,250.5 $" in the viewer's language.
export function formatMoney(value, code, lang = "ar") {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value).toLocaleString(lang === "ar" ? "ar" : "en", { maximumFractionDigits: 2 });
  return `${n} ${currencySymbol(code, lang)}`;
}

// `amount` in currency `from` → currency `to`. `rates`: { CODE: units per 1 base }.
export function convert(amount, from, to, rates) {
  const v = Number(amount);
  if (amount === "" || amount === null || !Number.isFinite(v)) return "";
  if (from === to) return v;
  const a = rates[from];
  const b = rates[to];
  if (!(a > 0 && b > 0)) return "";
  return Math.round((v / a) * b * 100) / 100;
}

// The currency shown next to `code` for the automatic exchange: the base currency, or
// (when `code` is the base) the first other currency (USD ↔ SAR).
export function partnerCurrency(code, currencies) {
  if (!currencies?.list?.length) return null;
  if (code !== currencies.base) return currencies.base;
  return currencies.list.find((c) => c.code !== code)?.code || null;
}

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pe-12 ps-3 text-sm text-white outline-none placeholder:text-white/45 focus:border-white/30";

// A number input with the currency's symbol inside it.
function SymbolInput({ value, onChange, symbol, onFocus, onBlur, ariaLabel }) {
  return (
    <div className="relative" dir="ltr">
      <input
        type="number"
        min="0"
        step="any"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        aria-label={ariaLabel}
        className={inputClass}
      />
      <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm font-semibold text-emerald-200/80">{symbol}</span>
    </div>
  );
}

// An amount kept in `currency`, typed in it or in `partner`: each side updates the other
// with the exchange rate. `value` / `onChange` are always in `currency`.
export function MoneyPair({ label, value, onChange, currency, partner, rates, lang }) {
  const [altText, setAltText] = useState(null); // while typing in the partner currency
  const derived = partner ? convert(value, currency, partner, rates) : "";
  return (
    <div className="sm:col-span-3">
      {label && <Label>{label}</Label>}
      <div className="grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <SymbolInput value={value} onChange={onChange} symbol={currencySymbol(currency, lang)} ariaLabel={currency} />
        {partner && (
          <>
            <ArrowLeftRight size={16} className="mx-auto hidden text-white/55 sm:block" />
            <SymbolInput
              value={altText ?? derived}
              symbol={currencySymbol(partner, lang)}
              ariaLabel={partner}
              onFocus={() => setAltText(derived === "" ? "" : String(derived))}
              onBlur={() => setAltText(null)}
              onChange={(text) => {
                setAltText(text);
                const back = convert(text, partner, currency, rates);
                onChange(back === "" ? "" : String(back));
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
