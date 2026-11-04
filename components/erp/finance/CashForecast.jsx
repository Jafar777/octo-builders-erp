"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatMoney } from "@/components/erp/intake/MoneyFields";
import { Card, ErrorText, Select } from "@/components/erp/ui/fields";

// Cash in the coming months: money in from unpaid invoices and from the milestones the
// Gantt expects to reach; money out for salaries and expenses.
export default function CashForecast() {
  const { t, lang } = useLanguage();
  const [months, setMonths] = useState("6");
  const [terms, setTerms] = useState("14");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/api/finance/forecast?months=${months}&terms=${terms}`)
      .then(setData)
      .catch((err) => setError(errorText(t, err)));
  }, [months, terms, t]);

  const base = data?.base;
  const money = (v) => formatMoney(Math.round(v), base, lang);
  const monthName = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleString(lang === "ar" ? "ar" : "en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
  const rows = data?.rows || [];
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.closing)), Math.abs(data?.startCash || 0));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Select label={t("erp.forecast.months")} value={months} onChange={setMonths} options={["3", "6", "9", "12"].map((v) => ({ value: v, label: v }))} />
        </div>
        <div className="w-48">
          <Select label={t("erp.forecast.terms")} value={terms} onChange={setTerms} options={["0", "7", "14", "30", "45", "60"].map((v) => ({ value: v, label: t("erp.forecast.days", { n: v }) }))} />
        </div>
      </div>
      <ErrorText>{error}</ErrorText>

      {data && (
        <>
          <Card>
            <p className="mb-1 text-sm text-white/55">{t("erp.forecast.today", { amount: money(data.startCash) })}</p>
            {/* Closing cash per month: bars from a zero line, below zero in red. */}
            <div className="mt-4 flex h-44 items-stretch gap-2" role="img" aria-label={t("erp.forecast.chart")}>
              {rows.map((r) => {
                const h = (Math.abs(r.closing) / max) * 50;
                return (
                  <div key={r.month} className="flex min-w-0 flex-1 flex-col">
                    <div className="relative flex-1">
                      <div className="absolute inset-x-0 top-1/2 border-t border-white/15" />
                      <div
                        className={`absolute inset-x-1 rounded-sm ${r.closing >= 0 ? "bg-emerald-400/70" : "bg-red-400/70"}`}
                        style={r.closing >= 0 ? { bottom: "50%", height: `${h}%` } : { top: "50%", height: `${h}%` }}
                        title={money(r.closing)}
                      />
                    </div>
                    <span className="mt-1 truncate text-center text-[11px] text-white/60">{monthName(r.month)}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-xs text-white/60">
                  <tr className="border-b border-white/10">
                    {["month", "opening", "invoicesIn", "plannedIn", "salaries", "expenses", "closing"].map((k) => (
                      <th key={k} className="px-2 py-2 text-start font-medium">
                        {t(`erp.forecast.col.${k}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.month} className="border-b border-white/5">
                      <td className="px-2 py-2">{monthName(r.month)}</td>
                      <td className="px-2 py-2 tabular-nums text-white/60">{money(r.opening)}</td>
                      <td className="px-2 py-2 tabular-nums text-emerald-300">{r.invoicesIn ? `+${money(r.invoicesIn)}` : "—"}</td>
                      <td className="px-2 py-2 tabular-nums text-emerald-300/80">{r.plannedIn ? `+${money(r.plannedIn)}` : "—"}</td>
                      <td className="px-2 py-2 tabular-nums text-red-300/80">−{money(r.salaries)}</td>
                      <td className="px-2 py-2 tabular-nums text-red-300/80">−{money(r.expenses)}</td>
                      <td className={`px-2 py-2 font-semibold tabular-nums ${r.closing < 0 ? "text-red-300" : ""}`}>{money(r.closing)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {data.planned.length > 0 && (
            <Card>
              <p className="mb-2 font-semibold">{t("erp.forecast.plannedTitle")}</p>
              <ul className="divide-y divide-white/5 text-sm">
                {data.planned.map((p, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      {p.projectName?.[lang] || ""} · {p.milestone}
                    </span>
                    <span className="text-white/60">{p.date}</span>
                    <span className="tabular-nums">{money(p.baseAmount)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <p className="text-xs text-white/60">
            {t("erp.forecast.assumptions", {
              salaries: money(data.assumptions.monthlySalaries),
              expenses: money(data.assumptions.averageExpenses),
            })}
          </p>
        </>
      )}
    </div>
  );
}
