"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import BilingualField from "@/components/dashboard/BilingualField";
import { Button, Card, ErrorText, Input, PageHeader, Select } from "@/components/erp/ui/fields";
import { PageSkeleton } from "@/components/erp/ui/Loading";

const weight = (item) => Math.max(0, ...item.bands.map((b) => Number(b.points) || 0));
const cell = "w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none focus:border-white/30";

// GM editor for the KPI (answer 4: everything dynamic).
export default function KpiConfig() {
  const { t } = useLanguage();
  const [config, setConfig] = useState(null);
  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/kpi/config").then((d) => {
      setMeta(d);
      setConfig({ ...d.current, from: d.month });
    }).catch((err) => setError(errorText(t, err)));
  }, [t]);

  if (!config) return error ? <ErrorText>{error}</ErrorText> : <PageSkeleton tiles={0} />;
  const total = config.indicators.reduce((a, ind) => a + ind.items.reduce((b, i) => b + weight(i), 0), 0);

  const updInd = (i, patch) => setConfig((c) => ({ ...c, indicators: c.indicators.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const updItem = (i, k, patch) => updInd(i, { items: config.indicators[i].items.map((x, j) => (j === k ? { ...x, ...patch } : x)) });
  const updBand = (i, k, b, patch) => updItem(i, k, { bands: config.indicators[i].items[k].bands.map((x, j) => (j === b ? { ...x, ...patch } : x)) });

  async function save() {
    setStatus("");
    setError("");
    try {
      const res = await api("/api/kpi/config", { method: "PUT", body: config });
      setStatus(t("erp.kpi.savedFrom", { from: config.from, total: res.total }));
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  const num = (v) => (v === "" || v === null ? null : Number(v));

  return (
    <div className="max-w-6xl">
      <Link href="/dashboard/kpi" className="mb-4 inline-flex items-center gap-2 text-sm text-white/55 hover:text-white">
        <ArrowLeft size={15} className="rtl:rotate-180" /> {t("erp.nav.kpi")}
      </Link>
      <PageHeader title={t("erp.kpi.configure")} subtitle={t("erp.kpi.configSubtitle")} />

      <Card className="mb-6 flex flex-wrap items-end gap-4">
        <div className="w-44">
          <Input type="month" label={t("erp.kpi.appliesFrom")} value={config.from} onChange={(from) => setConfig((c) => ({ ...c, from }))} />
        </div>
        <div className="w-32">
          <Input type="number" label={t("erp.kpi.targetScore")} value={config.target} onChange={(target) => setConfig((c) => ({ ...c, target: Number(target) }))} dir="ltr" />
        </div>
        <p className={`text-sm ${total === 100 ? "text-emerald-300" : "text-amber-300"}`}>
          {t("erp.kpi.totalWeight", { total })}
          {total !== 100 && ` — ${t("erp.kpi.normalized")}`}
        </p>
        <p className="w-full text-xs text-white/40">{t("erp.kpi.bandHint")}</p>
      </Card>

      <div className="space-y-6">
        {config.indicators.map((ind, i) => (
          <Card key={i} className="space-y-4">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <BilingualField label={`${t("erp.kpi.indicator")} ${i + 1}`} value={ind.name} onChange={(name) => updInd(i, { name })} />
              </div>
              <span className="mb-3 text-sm text-white/60">
                {t("erp.kpi.weight")}: <b className="text-white">{ind.items.reduce((a, it) => a + weight(it), 0)}</b>
              </span>
              <button type="button" onClick={() => setConfig((c) => ({ ...c, indicators: c.indicators.filter((_, j) => j !== i) }))} className="mb-3 text-red-400" aria-label={t("common.delete")}>
                <Trash2 size={16} />
              </button>
            </div>

            {ind.items.map((item, k) => (
              <div key={k} className="space-y-3 rounded-xl border border-white/10 p-3">
                <div className="grid items-end gap-3 lg:grid-cols-[1fr_220px_auto]">
                  <BilingualField label={t("erp.kpi.item")} value={item.name} onChange={(name) => updItem(i, k, { name })} />
                  <Select
                    label={t("erp.kpi.metric")}
                    value={item.metric || ""}
                    onChange={(metric) => updItem(i, k, { metric })}
                    options={Object.keys(meta.metrics).map((m) => ({ value: m, label: t(`erp.kpi.metrics.${m}`) }))}
                  />
                  <button type="button" onClick={() => updInd(i, { items: ind.items.filter((_, j) => j !== k) })} className="mb-3 text-red-400" aria-label={t("common.delete")}>
                    <Trash2 size={15} />
                  </button>
                </div>
                <table className="w-full max-w-lg text-sm">
                  <thead className="text-xs text-white/45">
                    <tr>
                      <th className="px-1 pb-1 text-start font-medium">{t("erp.kpi.bandFrom")}</th>
                      <th className="px-1 pb-1 text-start font-medium">{t("erp.kpi.bandTo")}</th>
                      <th className="px-1 pb-1 text-start font-medium">{t("erp.kpi.points")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {item.bands.map((b, bi) => (
                      <tr key={bi}>
                        <td className="p-1"><input dir="ltr" className={cell} value={b.min ?? ""} placeholder="−∞" onChange={(e) => updBand(i, k, bi, { min: num(e.target.value) })} /></td>
                        <td className="p-1"><input dir="ltr" className={cell} value={b.max ?? ""} placeholder="+∞" onChange={(e) => updBand(i, k, bi, { max: num(e.target.value) })} /></td>
                        <td className="p-1"><input dir="ltr" className={cell} value={b.points} onChange={(e) => updBand(i, k, bi, { points: Number(e.target.value) || 0 })} /></td>
                        <td className="p-1">
                          <button type="button" onClick={() => updItem(i, k, { bands: item.bands.filter((_, j) => j !== bi) })} className="text-red-400" aria-label={t("common.delete")}>
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button type="button" onClick={() => updItem(i, k, { bands: [...item.bands, { min: null, max: null, points: 0 }] })} className="text-xs text-brand-orange hover:underline">
                  + {t("erp.kpi.addBand")}
                </button>
              </div>
            ))}
            <Button variant="ghost" onClick={() => updInd(i, { items: [...ind.items, { key: "", metric: "on_time_pct", name: { ar: "", en: "" }, bands: [{ min: null, max: null, points: 0 }] }] })}>
              <Plus size={16} /> {t("erp.kpi.addItem")}
            </Button>
          </Card>
        ))}
        <Button variant="ghost" onClick={() => setConfig((c) => ({ ...c, indicators: [...c.indicators, { key: "", name: { ar: "", en: "" }, items: [] }] }))}>
          <Plus size={16} /> {t("erp.kpi.addIndicator")}
        </Button>

        <Card className="space-y-3">
          <p className="font-semibold">{t("erp.kpi.grades")}</p>
          {config.grades.map((g, gi) => (
            <div key={gi} className="grid items-end gap-3 sm:grid-cols-[120px_1fr]">
              <Input type="number" label={t("erp.kpi.fromScore")} value={g.min} dir="ltr" onChange={(v) => setConfig((c) => ({ ...c, grades: c.grades.map((x, j) => (j === gi ? { ...x, min: Number(v) } : x)) }))} />
              <BilingualField label={t("erp.kpi.grade")} value={g.name} onChange={(name) => setConfig((c) => ({ ...c, grades: c.grades.map((x, j) => (j === gi ? { ...x, name } : x)) }))} />
            </div>
          ))}
        </Card>
      </div>

      <div className="sticky bottom-4 mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-brand-navy/95 p-4 backdrop-blur">
        <Button onClick={save}>{t("erp.kpi.saveVersion")}</Button>
        <ErrorText>{error}</ErrorText>
        {status && <p className="text-sm text-emerald-300">{status}</p>}
        <p className="text-xs text-white/40">{meta.versions.length ? `${t("erp.kpi.versions")}: ${meta.versions.join(", ")}` : t("erp.kpi.usingDefaults")}</p>
      </div>
    </div>
  );
}
