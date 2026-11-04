"use client";

import { useCallback, useEffect, useState } from "react";
import { Save } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatMoney } from "@/components/erp/intake/MoneyFields";
import { Button, Card, ErrorText, Select } from "@/components/erp/ui/fields";

const MONTHS = Array.from({ length: 12 }, (_, i) => i);
const sum = (a) => a.reduce((s, v) => s + (Number(v) || 0), 0);

// A monthly budget per line (salaries, project expenses, each expense category), for the
// whole company or one branch, with what was actually spent beside it.
export default function Budgets({ lookups, year, canManage }) {
  const { t, lang } = useLanguage();
  const [branch, setBranch] = useState("");
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({}); // line -> months
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api(`/api/finance/budgets?year=${year}${branch ? `&branch=${branch}` : ""}`)
      .then((d) => {
        setData(d);
        setDraft({});
      })
      .catch((err) => setError(errorText(t, err)));
  }, [year, branch, t]);
  useEffect(() => {
    load();
  }, [load]);

  const lineName = (line) => (line === "salaries" ? t("erp.books.account.salaries") : line === "project_expenses" ? t("erp.books.account.project_expenses") : lookups.categoryName(line));
  const monthName = (i) => new Date(Date.UTC(2026, i, 1)).toLocaleString(lang === "ar" ? "ar" : "en-GB", { month: "short", timeZone: "UTC" });

  async function save(line) {
    setSaving(line);
    setError("");
    try {
      await api("/api/finance/budgets", { method: "PUT", body: { year, branch: branch || null, line, months: draft[line] } });
      load();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setSaving(null);
    }
  }

  const base = data?.base;
  const current = data?.currentMonth;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-56">
          <Select value={branch} onChange={setBranch} placeholder={t("erp.books.allBranches")} options={lookups.branches.map((b) => ({ value: b.id, label: b.name?.[lang] }))} />
        </div>
        <p className="text-xs text-white/60">{t("erp.budgets.hint")}</p>
      </div>
      <ErrorText>{error}</ErrorText>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-xs">
            <thead className="text-white/60">
              <tr className="border-b border-white/10">
                <th className="px-2 py-2 text-start font-medium">{t("erp.budgets.line")}</th>
                {MONTHS.map((i) => (
                  <th key={i} className="px-1 py-2 text-start font-medium">
                    {monthName(i)}
                  </th>
                ))}
                <th className="px-2 py-2 text-start font-medium">{t("erp.budgets.year")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.lines.map((l) => {
                const months = draft[l.line] || l.budget;
                const totalBudget = sum(months);
                const totalActual = sum(l.actual);
                const over = totalBudget > 0 && totalActual > totalBudget;
                return (
                  <tr key={l.line} className="border-b border-white/5 align-top">
                    <td className="px-2 py-2 text-sm">{lineName(l.line)}</td>
                    {MONTHS.map((i) => {
                      const month = `${data.year}-${String(i + 1).padStart(2, "0")}`;
                      const past = month <= current;
                      const bad = past && months[i] > 0 && l.actual[i] > months[i];
                      return (
                        <td key={i} className="px-1 py-1.5">
                          <input
                            type="number"
                            disabled={!canManage}
                            value={months[i] || ""}
                            onChange={(e) => setDraft((d) => ({ ...d, [l.line]: months.map((v, j) => (j === i ? Number(e.target.value) || 0 : v)) }))}
                            aria-label={`${lineName(l.line)} ${monthName(i)}`}
                            dir="ltr"
                            className="w-20 rounded-md border border-white/10 bg-white/5 px-1.5 py-1 outline-none focus:border-white/30 disabled:opacity-60"
                          />
                          {past && <span className={`mt-0.5 block tabular-nums ${bad ? "text-red-300" : "text-white/55"}`}>{Math.round(l.actual[i])}</span>}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5">
                      <span className="block tabular-nums">{formatMoney(totalBudget, base, lang)}</span>
                      <span className={`block tabular-nums ${over ? "text-red-300" : "text-white/60"}`}>{formatMoney(totalActual, base, lang)}</span>
                    </td>
                    <td className="px-1 py-1.5">
                      {canManage && draft[l.line] && (
                        <Button onClick={() => save(l.line)} loading={saving === l.line} className="!px-2 !py-1.5">
                          <Save size={13} />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-white/55">{t("erp.budgets.legend")}</p>
      </Card>
    </div>
  );
}
