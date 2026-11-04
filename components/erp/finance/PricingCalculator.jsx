"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { quote } from "@/lib/pricing";
import { Button, Card, ErrorText, Input, PageHeader, Select } from "@/components/erp/ui/fields";
import { hm, money } from "@/components/erp/hr/hrUi";

export default function PricingCalculator({ embedded = false }) {
  const { t, lang } = useLanguage();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null);
  const [hourlyOverride, setHourlyOverride] = useState("");

  useEffect(() => {
    api("/api/finance/pricing")
      .then((d) => {
        setData(d);
        setForm({
          lines: [{ service: d.pricing.services[0]?.key || "", quantity: 1 }],
          sizeKey: d.pricing.sizes[1]?.key || d.pricing.sizes[0]?.key,
          marketKey: d.pricing.markets[0]?.key,
          complexityKey: d.pricing.complexity.find((c) => c.factor === 1)?.key || d.pricing.complexity[0]?.key,
          clientKey: d.pricing.clientTypes[0]?.key,
        });
      })
      .catch((err) => setError(errorText(t, err)));
  }, [t]);

  const hourlyCost = hourlyOverride !== "" ? Number(hourlyOverride) : data?.hourlyCost.used;
  const result = useMemo(() => (data && form ? quote({ ...form, hourlyCost, pricing: data.pricing }) : null), [data, form, hourlyCost]);

  if (!data || !form) return <ErrorText>{error}</ErrorText>;
  const P = data.pricing;
  const b = data.base;
  const name = (x) => x.name?.[lang];
  const setLine = (i, patch) => setForm((f) => ({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  const summaryText = [
    ...form.lines.map((l) => `${name(P.services.find((s) => s.key === l.service) || {})} × ${l.quantity}`),
    `${t("erp.pricing.hours")}: ${result.hours.total}`,
    `${t("erp.pricing.price")}: ${money(result.price, b, lang)}`,
  ].join("\n");

  return (
    <div className="max-w-5xl">
      {!embedded && <PageHeader title={t("erp.nav.pricing")} subtitle={t("erp.pricing.subtitle")} />}
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card className="space-y-3">
            <p className="font-semibold">{t("erp.pricing.services")}</p>
            {form.lines.map((line, i) => (
              <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_110px_auto]">
                <Select label={i === 0 ? t("erp.pricing.service") : undefined} value={line.service} onChange={(service) => setLine(i, { service })} options={P.services.map((s) => ({ value: s.key, label: name(s) }))} />
                <Input type="number" min="0" step="0.5" label={i === 0 ? t("erp.pricing.quantity") : undefined} value={line.quantity} onChange={(quantity) => setLine(i, { quantity })} dir="ltr" />
                <button type="button" onClick={() => setForm((f) => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }))} className="mb-2.5 text-red-400" aria-label={t("common.delete")}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <Button variant="ghost" onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, { service: P.services[0].key, quantity: 1 }] }))}>
              <Plus size={16} /> {t("erp.pricing.addService")}
            </Button>
          </Card>
          <Card className="grid gap-4 sm:grid-cols-2">
            <Select label={t("erp.pricing.size")} value={form.sizeKey} onChange={(sizeKey) => setForm((f) => ({ ...f, sizeKey }))} options={P.sizes.map((s) => ({ value: s.key, label: `${name(s)} — ${s.margin}%` }))} />
            <Select label={t("erp.pricing.market")} value={form.marketKey} onChange={(marketKey) => setForm((f) => ({ ...f, marketKey }))} options={P.markets.map((s) => ({ value: s.key, label: `${name(s)} × ${s.factor}` }))} />
            <Select label={t("erp.pricing.complexity")} value={form.complexityKey} onChange={(complexityKey) => setForm((f) => ({ ...f, complexityKey }))} options={P.complexity.map((s) => ({ value: s.key, label: `${name(s)} × ${s.factor}` }))} />
            <Select label={t("erp.pricing.clientType")} value={form.clientKey} onChange={(clientKey) => setForm((f) => ({ ...f, clientKey }))} options={P.clientTypes.map((s) => ({ value: s.key, label: `${name(s)} × ${s.factor}` }))} />
            <div className="sm:col-span-2">
              <Input
                type="number"
                step="0.01"
                label={t("erp.pricing.hourlyCost", { base: b })}
                value={hourlyOverride}
                placeholder={String(data.hourlyCost.used)}
                onChange={setHourlyOverride}
                dir="ltr"
              />
              <p className="mt-1 text-xs text-white/60">
                {data.canSeeCosts && data.hourlyCost.mode === "auto" && data.hourlyCost.auto !== null
                  ? t("erp.pricing.autoHint", { value: data.hourlyCost.auto, hours: data.hourlyCost.capacity })
                  : t("erp.pricing.manualHint", { value: data.hourlyCost.used })}
              </p>
            </div>
          </Card>
        </div>

        <Card className="h-fit space-y-2 lg:sticky lg:top-20">
          <p className="mb-2 font-semibold">{t("erp.pricing.result")}</p>
          {[
            ["hoursDesign", `${hm(result.hours.design)} h`],
            ["hoursTech", `${hm(result.hours.tech)} h`],
            ["hoursAdmin", `${hm(result.hours.admin)} h`],
            ["rawCost", money(result.rawCost, b, lang)],
            ["multiplier", `× ${result.multiplier}`],
            ["realCost", money(result.realCost, b, lang)],
            ["margin", `${result.margin}%`],
            ["profit", money(result.profit, b, lang)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 text-sm">
              <span className="text-white/60">{t(`erp.pricing.${k}`)}</span>
              <span className="tabular-nums" dir="ltr">{v}</span>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-3 border-t border-white/10 pt-3">
            <span className="font-semibold">{t("erp.pricing.price")}</span>
            <span className="text-2xl font-bold tabular-nums text-brand-orange">{money(result.price, b, lang)}</span>
          </div>
          {data.currencies.list
            .filter((c) => c.code !== b)
            .map((c) => (
              <p key={c.code} className="text-end text-sm tabular-nums text-white/55">≈ {money(result.price * c.rate, c.code, lang)}</p>
            ))}
          <Button variant="ghost" className="mt-2 w-full" onClick={() => navigator.clipboard?.writeText(summaryText)}>
            <Copy size={15} /> {t("erp.pricing.copy")}
          </Button>
        </Card>
      </div>
    </div>
  );
}
