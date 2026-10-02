"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api } from "@/lib/clientApi";
import { money } from "@/components/erp/hr/hrUi";
import { SkeletonTable } from "@/components/erp/ui/Loading";

const KIND_STYLE = {
  contract: "bg-sky-500/15 text-sky-300",
  adjustment: "bg-violet-500/15 text-violet-300",
  payment: "bg-emerald-500/15 text-emerald-300",
  project_expense: "bg-red-500/15 text-red-300",
  operating_expense: "bg-red-500/15 text-red-300",
};

export default function EntryList({ entries, lookups, canManage, onEdit, onChanged, showProject = false }) {
  const { t, lang } = useLanguage();
  if (entries === null) return <SkeletonTable rows={5} cols={6} />;
  async function remove(e) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    await api(`/api/finance/entries/${e.id}`, { method: "DELETE" }).catch(() => {});
    onChanged();
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="bg-white/[0.04] text-xs text-white/50">
          <tr>
            {["date", "kind", showProject ? "project" : "fund", "details", "amount", "base"].map((h) => (
              <th key={h} className="px-3 py-2.5 text-start font-medium">{t(`erp.finance.col.${h}`)}</th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-t border-white/5">
              <td className="whitespace-nowrap px-3 py-2.5 text-white/70" dir="ltr">{e.date}</td>
              <td className="px-3 py-2.5">
                <span className={`rounded-full px-2.5 py-0.5 text-xs ${KIND_STYLE[e.kind]}`}>{t(`erp.finance.kind.${e.kind}`)}</span>
              </td>
              <td className="px-3 py-2.5 text-white/70">{showProject ? lookups.projectName(e.project) : lookups.branchName(e.branch)}</td>
              <td className="px-3 py-2.5 text-white/60">
                {[e.category && lookups.categoryName(e.category), e.beneficiary, lookups.clientName(e.client), e.description].filter(Boolean).join(" · ")}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                {money(e.amount, e.currency, lang)}
                {e.rate !== 1 && <span className="ms-1 text-[10px] text-white/40" dir="ltr">@{e.rate}</span>}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-white/70">{money(e.baseAmount, lookups.base, lang)}</td>
              <td className="px-3 py-2.5 text-end">
                {canManage && (
                  <span className="inline-flex gap-1">
                    <button type="button" onClick={() => onEdit(e)} className="p-1.5 text-white/50 hover:text-white" aria-label={t("common.edit")}><Pencil size={14} /></button>
                    <button type="button" onClick={() => remove(e)} className="p-1.5 text-red-400" aria-label={t("common.delete")}><Trash2 size={14} /></button>
                  </span>
                )}
              </td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr><td colSpan={7} className="py-10 text-center text-white/40">{t("dashboard.noItems")}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
