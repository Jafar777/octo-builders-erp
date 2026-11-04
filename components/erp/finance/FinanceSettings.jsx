"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import BilingualField from "@/components/dashboard/BilingualField";
import SaveBar from "@/components/dashboard/SaveBar";
import { Button, Card, Input, Select } from "@/components/erp/ui/fields";

function useSave(key, onSaved) {
  const { t } = useLanguage();
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  async function save(value) {
    setStatus("saving");
    setError("");
    try {
      await api("/api/settings", { method: "PUT", body: { key, value } });
      setStatus("saved");
      onSaved?.();
      setTimeout(() => setStatus("idle"), 2000);
    } catch (err) {
      setStatus("idle");
      setError(errorText(t, err));
    }
  }
  return { status, error, save };
}

// Editable list of { key?, name{ar,en}, ...numeric fields }.
function FactorList({ title, items, onChange, fields }) {
  const { t } = useLanguage();
  const update = (i, patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-white/70">{title}</p>
      {items.map((item, i) => (
        <div key={i} className="grid grid-cols-1 items-end gap-2 rounded-xl border border-white/10 p-3 sm:[grid-template-columns:var(--cols)]" style={{ "--cols": `1fr ${fields.map(() => "110px").join(" ")} auto` }}>
          <BilingualField label={t("erp.org.name")} value={item.name} onChange={(name) => update(i, { name })} />
          {fields.map((f) => (
            <Input key={f} type="number" step="0.01" label={t(`erp.pricing.field.${f}`)} value={item[f]} onChange={(v) => update(i, { [f]: Number(v) })} dir="ltr" />
          ))}
          <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="mb-2.5 text-red-400" aria-label={t("common.delete")}>
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <Button variant="ghost" onClick={() => onChange([...items, { key: "", name: { ar: "", en: "" }, ...Object.fromEntries(fields.map((f) => [f, f === "factor" ? 1 : 0])) }])}>
        <Plus size={16} /> {t("common.add")}
      </Button>
    </div>
  );
}

export default function FinanceSettings({ settings, onSaved }) {
  const { t } = useLanguage();
  const [categories, setCategories] = useState(settings.finance.expenseCategories);
  const [allocation, setAllocation] = useState(settings.finance.allocation || "hours");
  const [pricing, setPricing] = useState(settings.pricing);
  const cat = useSave("finance", onSaved);
  const pr = useSave("pricing", onSaved);
  const setP = (field) => (value) => setPricing((p) => ({ ...p, [field]: value }));

  return (
    <div className="max-w-5xl space-y-6">
      <Card className="space-y-4">
        <p className="text-lg font-semibold">{t("erp.finance.categories")}</p>
        {categories.map((c, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="flex-1">
              <BilingualField label={t("erp.org.name")} value={c.name} onChange={(name) => setCategories((l) => l.map((x, j) => (j === i ? { ...x, name } : x)))} />
            </div>
            <button type="button" onClick={() => setCategories((l) => l.filter((_, j) => j !== i))} className="mb-2.5 text-red-400" aria-label={t("common.delete")}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <Button variant="ghost" onClick={() => setCategories((l) => [...l, { key: "", name: { ar: "", en: "" } }])}>
          <Plus size={16} /> {t("common.add")}
        </Button>
        <div className="max-w-md border-t border-white/10 pt-4">
          <Select
            label={t("erp.finance.allocation")}
            value={allocation}
            onChange={setAllocation}
            options={["hours", "equal"].map((k) => ({ value: k, label: t(`erp.finance.allocation_${k}`) }))}
          />
          <p className="mt-1 text-xs text-white/60">{t(`erp.finance.allocationHint_${allocation}`)}</p>
        </div>
        <SaveBar status={cat.status} error={cat.error} onSave={() => cat.save({ expenseCategories: categories, allocation })} />
      </Card>

      <Card className="space-y-6">
        <p className="text-lg font-semibold">{t("erp.pricing.settings")}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            label={t("erp.pricing.hourlyMode")}
            value={pricing.hourlyCostMode}
            onChange={setP("hourlyCostMode")}
            options={["auto", "manual"].map((m) => ({ value: m, label: t(`erp.pricing.mode_${m}`) }))}
          />
          <Input type="number" step="0.01" label={t("erp.pricing.manualHourly")} value={pricing.manualHourlyCost} onChange={(v) => setP("manualHourlyCost")(Number(v))} dir="ltr" />
          <Input type="number" label={t("erp.pricing.autoMonths")} value={pricing.autoMonths} onChange={(v) => setP("autoMonths")(Number(v))} dir="ltr" />
        </div>
        <FactorList title={t("erp.pricing.services")} items={pricing.services} onChange={setP("services")} fields={["designHours", "techHours", "adminHours"]} />
        <FactorList title={t("erp.pricing.size")} items={pricing.sizes} onChange={setP("sizes")} fields={["margin"]} />
        <FactorList title={t("erp.pricing.market")} items={pricing.markets} onChange={setP("markets")} fields={["factor"]} />
        <FactorList title={t("erp.pricing.complexity")} items={pricing.complexity} onChange={setP("complexity")} fields={["factor"]} />
        <FactorList title={t("erp.pricing.clientType")} items={pricing.clientTypes} onChange={setP("clientTypes")} fields={["factor"]} />
        <SaveBar status={pr.status} error={pr.error} onSave={() => pr.save(pricing)} />
      </Card>
    </div>
  );
}
