"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api } from "@/lib/clientApi";
import { money } from "@/components/erp/hr/hrUi";
import { SkeletonTable } from "@/components/erp/ui/Loading";
import { useConfirm } from "@/components/erp/ui/Feedback";
import { EmptyState, ShowMore, SortTh, TableToolbar, useTableTools } from "@/components/erp/ui/DataTools";

const KIND_STYLE = {
  contract: "bg-sky-500/15 text-sky-300",
  adjustment: "bg-violet-500/15 text-violet-300",
  payment: "bg-emerald-500/15 text-emerald-300",
  project_expense: "bg-red-500/15 text-red-300",
  operating_expense: "bg-red-500/15 text-red-300",
};

export default function EntryList({ entries, lookups, canManage, onEdit, onChanged, showProject = false }) {
  const { t, lang } = useLanguage();
  const confirm = useConfirm();
  const place = (e) => (showProject ? lookups.projectName(e.project) : lookups.branchName(e.branch));
  const details = (e) => [e.category && lookups.categoryName(e.category), e.beneficiary, lookups.clientName(e.client), e.description].filter(Boolean).join(" · ");
  const third = showProject ? "project" : "fund";
  const tools = useTableTools(
    entries || [],
    { date: (e) => e.date, kind: (e) => t(`erp.finance.kind.${e.kind}`), [third]: place, details, amount: (e) => e.amount, base: (e) => e.baseAmount },
    { key: `entries-${third}`, search: (e) => [e.date, t(`erp.finance.kind.${e.kind}`), place(e), details(e), e.amount].join(" ") }
  );
  const exportColumns = [
    { label: t("erp.finance.col.date"), value: (e) => e.date },
    { label: t("erp.finance.col.kind"), value: (e) => t(`erp.finance.kind.${e.kind}`) },
    { label: t(`erp.finance.col.${third}`), value: place },
    { label: t("erp.finance.col.details"), value: details },
    { label: t("erp.finance.col.amount"), value: (e) => `${e.amount} ${e.currency}` },
    { label: t("erp.finance.col.base"), value: (e) => e.baseAmount },
  ];
  if (entries === null) return <SkeletonTable rows={5} cols={6} />;
  async function remove(e) {
    if (!(await confirm({ text: t("common.confirmDelete"), kind: "delete" }))) return;
    await api(`/api/finance/entries/${e.id}`, { method: "DELETE" }).catch(() => {});
    onChanged();
  }
  return (
    <div>
    {entries.length > 0 && <TableToolbar tools={tools} exportFile={t("erp.ux.financeFile")} exportColumns={exportColumns} />}
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="bg-white/[0.04] text-xs text-white/50">
          <tr>
            {["date", "kind", third, "details", "amount", "base"].map((h) => (
              <SortTh key={h} tools={tools} col={h} className="!px-3 !py-2.5">
                {t(`erp.finance.col.${h}`)}
              </SortTh>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {tools.shown.map((e) => (
            <tr key={e.id} className="border-t border-white/5">
              <td className="whitespace-nowrap px-3 py-2.5 text-white/70" dir="ltr">{e.date}</td>
              <td className="px-3 py-2.5">
                <span className={`rounded-full px-2.5 py-0.5 text-xs ${KIND_STYLE[e.kind]}`}>{t(`erp.finance.kind.${e.kind}`)}</span>
              </td>
              <td className="px-3 py-2.5 text-white/70">{place(e)}</td>
              <td className="px-3 py-2.5 text-white/60">{details(e)}</td>
              <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                {money(e.amount, e.currency, lang)}
                {e.rate !== 1 && <span className="ms-1 text-[11px] text-white/60" dir="ltr">@{e.rate}</span>}
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
          {tools.view.length === 0 && (
            <tr>
              <td colSpan={7}>
                <EmptyState compact title={entries.length ? t("erp.ux.noMatches") : t("erp.ux.emptyTitle")} text={entries.length ? t("erp.ux.noMatchesText") : t("erp.ux.noEntriesText")} />
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <ShowMore tools={tools} />
    </div>
    </div>
  );
}
