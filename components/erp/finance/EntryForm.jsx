"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { Button, ErrorText, Input, Select } from "@/components/erp/ui/fields";
import { money } from "@/components/erp/hr/hrUi";

// Today on this device's clock (not UTC: after midnight here, UTC can still be yesterday).
const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// Create or edit one finance entry. `kinds` limits which kinds can be chosen.
export default function EntryForm({ lookups, kinds, entry, preset = {}, onSaved, onCancel }) {
  const { t, lang } = useLanguage();
  const currencies = lookups.settings.currencies;
  const rateFor = (code) => currencies.list.find((c) => c.code === code)?.rate || 1;
  const [form, setForm] = useState({
    kind: entry?.kind || preset.kind || kinds[0],
    project: entry?.project || preset.project || "",
    client: entry?.client || "",
    branch: entry?.branch || preset.branch || "",
    date: entry?.date || today(),
    amount: entry?.amount ?? "",
    currency: entry?.currency || currencies.base,
    rate: entry?.rate ?? rateFor(entry?.currency || currencies.base),
    category: entry?.category || "office",
    beneficiary: entry?.beneficiary || "",
    description: entry?.description || "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (f) => (v) => setForm((x) => ({ ...x, [f]: v }));

  const needsProject = form.kind !== "operating_expense";
  const cash = ["payment", "project_expense", "operating_expense"].includes(form.kind);
  const isExpense = form.kind.endsWith("_expense");
  const isBase = form.currency === currencies.base;
  const baseValue = isBase ? Number(form.amount) || 0 : (Number(form.amount) || 0) / (Number(form.rate) || 1);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const body = { ...form, amount: Number(form.amount), rate: Number(form.rate) };
      const res = entry
        ? await api(`/api/finance/entries/${entry.id}`, { method: "PATCH", body })
        : await api("/api/finance/entries", { method: "POST", body });
      onSaved(res.entry);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {kinds.length > 1 && (
        <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 p-1">
          {kinds.map((k) => (
            <button key={k} type="button" onClick={() => set("kind")(k)} className={`flex-1 rounded-lg px-3 py-2 text-sm ${form.kind === k ? "bg-brand-orange text-white" : "text-white/60"}`}>
              {t(`erp.finance.kind.${k}`)}
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-white/45">{t(`erp.finance.kindHint.${form.kind}`)}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {needsProject && (
          <Select
            label={t("erp.tasks.project")}
            value={form.project}
            onChange={set("project")}
            placeholder="—"
            options={lookups.projects.map((p) => ({ value: p.id, label: `${p.code ? `${p.code} · ` : ""}${p.name?.[lang]}` }))}
          />
        )}
        {cash && (
          <Select
            label={t("erp.finance.fund")}
            value={form.branch}
            onChange={set("branch")}
            placeholder="—"
            options={lookups.branches.map((b) => ({ value: b.id, label: b.name?.[lang] }))}
          />
        )}
        {form.kind === "payment" && (
          <Select label={t("erp.finance.client")} value={form.client} onChange={set("client")} placeholder="—" options={lookups.clients.map((c) => ({ value: c.id, label: c.name }))} />
        )}
        {isExpense && (
          <Select
            label={t("erp.finance.category")}
            value={form.category}
            onChange={set("category")}
            options={lookups.settings.finance.expenseCategories.map((c) => ({ value: c.key, label: c.name?.[lang] }))}
          />
        )}
        <Input type="date" label={t("erp.settings.date")} value={form.date} onChange={set("date")} />
        <Input
          type="number"
          step="0.01"
          label={form.kind === "adjustment" ? t("erp.finance.amountSigned") : t("erp.hr.amount")}
          value={form.amount}
          onChange={set("amount")}
          dir="ltr"
        />
        <Select
          label={t("erp.org.currency")}
          value={form.currency}
          onChange={(currency) => setForm((x) => ({ ...x, currency, rate: rateFor(currency) }))}
          options={currencies.list.map((c) => ({ value: c.code, label: `${c.code} — ${c.name?.[lang]}` }))}
        />
        {!isBase && (
          <Input type="number" step="0.0001" label={t("erp.finance.rateLabel", { base: currencies.base })} value={form.rate} onChange={set("rate")} dir="ltr" />
        )}
        {isExpense && <Input label={t("erp.finance.beneficiary")} value={form.beneficiary} onChange={set("beneficiary")} />}
      </div>
      <Input label={t("erp.tasks.description")} value={form.description} onChange={set("description")} />
      {!isBase && form.amount !== "" && (
        <p className="text-sm text-white/60">
          = <span className="font-semibold text-white">{money(baseValue, currencies.base, lang)}</span>
        </p>
      )}
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>{t("common.cancel")}</Button>
        <Button onClick={save} disabled={saving || form.amount === ""}>{t("common.save")}</Button>
      </div>
    </div>
  );
}
