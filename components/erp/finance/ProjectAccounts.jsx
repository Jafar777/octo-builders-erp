"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import Modal from "@/components/erp/ui/Modal";
import { Button, Card, ErrorText, Input, Select } from "@/components/erp/ui/fields";
import { money, StatTile } from "@/components/erp/hr/hrUi";
import EntryForm from "@/components/erp/finance/EntryForm";
import EntryList from "@/components/erp/finance/EntryList";

const KINDS = ["contract", "adjustment", "payment", "project_expense"];

// One project's account: contract, additions/discounts, payments, expenses.
export default function ProjectAccounts({ lookups, summary, projectId, onProject, canManage, onChanged }) {
  const { t, lang } = useLanguage();
  const [entries, setEntries] = useState(null);
  const [editing, setEditing] = useState(null); // entry | "new"
  const [budget, setBudget] = useState("");
  const [budgetError, setBudgetError] = useState("");

  const load = useCallback(() => {
    if (!projectId) return;
    api(`/api/finance/entries?project=${projectId}`).then((d) => setEntries(d.entries)).catch(() => {});
  }, [projectId]);
  useEffect(() => {
    load();
  }, [load]);

  const row = summary?.projects.find((p) => p.id === projectId);
  const m = (v) => money(v || 0, lookups.base, lang);
  // Same figure in the project branch's own currency (e.g. SAR for Jeddah).
  const branchCurrency = lookups.branches.find((b) => b.id === row?.branch)?.currency;
  const localRate = lookups.settings?.currencies.list.find((c) => c.code === branchCurrency)?.rate;
  const local = (v) => (branchCurrency && branchCurrency !== lookups.base && localRate ? money((v || 0) * localRate, branchCurrency, lang) : "");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBudget(row?.budget ? String(row.budget) : "");
  }, [row?.id, row?.budget]);

  async function saveBudget() {
    setBudgetError("");
    try {
      await api(`/api/finance/projects/${projectId}`, { method: "PUT", body: { budget: Number(budget) || 0 } });
      onChanged();
    } catch (err) {
      setBudgetError(errorText(t, err));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-80">
          <Select
            label={t("erp.tasks.project")}
            value={projectId || ""}
            onChange={onProject}
            placeholder="—"
            options={lookups.projects.map((p) => ({ value: p.id, label: `${p.code ? `${p.code} · ` : ""}${p.name?.[lang]}` }))}
          />
        </div>
        {projectId && canManage && (
          <Button onClick={() => setEditing("new")}>
            <Plus size={16} /> {t("erp.finance.addMovement")}
          </Button>
        )}
      </div>

      {projectId && row && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <StatTile label={t("erp.finance.col.total")} value={m(row.total)} hint={row.adjustments ? `${t("erp.finance.kind.adjustment")}: ${m(row.adjustments)}` : ""} />
          <StatTile label={t("erp.finance.col.received")} value={m(row.received)} tone="text-emerald-300" />
          <StatTile label={t("erp.finance.col.remaining")} value={m(row.remaining)} tone={row.remaining > 0 ? "text-amber-300" : ""} />
          <StatTile label={t("erp.finance.col.expenses")} value={m(row.expenses)} />
          <StatTile label={t("erp.finance.col.overhead")} value={m(row.overhead)} hint={`${row.hours} h`} />
          <StatTile label={t("erp.finance.col.profitReceived")} value={m(row.profitReceived)} tone={row.profitReceived < 0 ? "text-red-300" : "text-emerald-300"} hint={local(row.profitReceived)} />
          <StatTile label={t("erp.finance.col.profitContract")} value={m(row.profitContract)} hint={local(row.profitContract)} />
        </div>
      )}

      {projectId && row && (
        <Card className="flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white/70">{t("erp.finance.budget")}</p>
            {row.budget > 0 ? (
              <>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${row.overBudget ? "bg-red-400" : row.budgetUsed > 85 ? "bg-amber-400" : "bg-emerald-400"}`}
                    style={{ width: `${Math.min(100, row.budgetUsed)}%` }}
                  />
                </div>
                <p className={`mt-1.5 flex items-center gap-1.5 text-sm ${row.overBudget ? "text-red-300" : "text-white/60"}`}>
                  {row.overBudget && <AlertTriangle size={14} />}
                  {t(row.overBudget ? "erp.finance.overBudget" : "erp.finance.budgetUsed", { used: m(row.cost), budget: m(row.budget), pct: row.budgetUsed })}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-white/45">{t("erp.finance.noBudget")}</p>
            )}
          </div>
          {canManage && (
            <div className="flex items-end gap-2">
              <div className="w-40">
                <Input type="number" min="0" step="0.01" label={t("erp.finance.budgetLabel", { base: lookups.base })} value={budget} onChange={setBudget} dir="ltr" />
              </div>
              <Button variant="ghost" onClick={saveBudget}>{t("common.save")}</Button>
            </div>
          )}
          <div className="w-full"><ErrorText>{budgetError}</ErrorText></div>
        </Card>
      )}

      {projectId ? (
        <EntryList
          entries={entries}
          lookups={lookups}
          canManage={canManage}
          onEdit={setEditing}
          onChanged={() => {
            load();
            onChanged();
          }}
        />
      ) : (
        <Card className="text-center text-white/50">{t("erp.finance.pickProject")}</Card>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={t("erp.finance.addMovement")} wide>
        {editing && lookups.settings && (
          <EntryForm
            lookups={lookups}
            kinds={editing === "new" ? KINDS : [editing.kind]}
            entry={editing === "new" ? null : editing}
            preset={{ project: projectId }}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              load();
              onChanged();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
