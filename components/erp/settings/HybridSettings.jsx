"use client";

import { useCallback, useEffect, useState } from "react";
import { Save } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDate } from "@/lib/formatTime";
import { Button, Card, ErrorText, Input, Toggle } from "@/components/erp/ui/fields";

// How work is planned and started together (lib/hybrid.js). The CEO only.
export default function HybridSettings({ taskTypes = [] }) {
  const { t, lang } = useLanguage();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState("");
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(() => {
    api("/api/hybrid")
      .then((d) => {
        setData(d);
        setForm({ ...d.settings, departments: Object.keys(d.settings.departments) });
      })
      .catch(() => setData(null));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  if (!data || !form) return null;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  async function run(key, work) {
    setBusy(key);
    setError("");
    try {
      setFlash(await work());
      load();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy("");
    }
  }
  return (
    <Card className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("erp.hybrid.title")}</h2>
        <p className="mt-1 text-sm text-white/60">{t("erp.hybrid.hint")}</p>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-white/70">{t("erp.hybrid.departments")}</p>
        {data.departments.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center gap-3">
            <Toggle checked={form.departments.includes(d.id)} onChange={(on) => set({ departments: on ? [...form.departments, d.id] : form.departments.filter((x) => x !== d.id) })} label={`${d.name?.[lang] || d.name?.ar} (${d.people})`} />
            {data.settings.departments[d.id] && <span className="text-xs text-white/60">{t("erp.hybrid.since", { at: formatDate(data.settings.departments[d.id], lang) })}</span>}
          </div>
        ))}
        <p className="text-xs text-amber-200/80">{t("erp.hybrid.excel")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input type="number" min="0" max="200" dir="ltr" label={t("erp.hybrid.adjust")} value={form.adjustPct} onChange={(adjustPct) => set({ adjustPct })} />
        <Input type="month" dir="ltr" label={t("erp.hybrid.kpiFrom")} value={form.kpiFrom} onChange={(kpiFrom) => set({ kpiFrom })} />
      </div>
      <p className="text-xs text-white/60">{t("erp.hybrid.kpiHint")}</p>
      <Toggle checked={form.endOfDay} onChange={(endOfDay) => set({ endOfDay })} label={t("erp.hybrid.endOfDay")} />
      <div>
        <p className="mb-2 text-sm font-medium text-white/70">{t("erp.hybrid.hours")}</p>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {taskTypes
            .filter((x) => x.key !== "meeting")
            .map((x) => (
              <Input key={x.key} type="number" min="0.5" max="200" step="0.5" dir="ltr" label={x.name?.[lang]} value={form.hours[x.key] ?? form.hours.other ?? 3} onChange={(v) => set({ hours: { ...form.hours, [x.key]: v } })} />
            ))}
        </div>
        <p className="mt-2 text-xs text-white/60">{t("erp.hybrid.hoursHint")}</p>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          loading={busy === "save"}
          disabled={Boolean(busy)}
          onClick={() =>
            run("save", async () => {
              await api("/api/hybrid", { method: "PUT", body: { ...form, adjustPct: Number(form.adjustPct) } });
              return t("erp.access.saved");
            })
          }
        >
          <Save size={16} /> {t("common.save")}
        </Button>
        {data.untracked > 0 && (
          <Button variant="ghost" loading={busy === "track"} disabled={Boolean(busy)} onClick={() => run("track", async () => t("erp.hybrid.tracked", { n: (await api("/api/hybrid", { method: "POST" })).tracked }))}>
            {t("erp.hybrid.track", { n: data.untracked })}
          </Button>
        )}
        {flash && <span className="text-sm text-emerald-300">{flash}</span>}
      </div>
      {data.waiting > 0 && <p className="text-xs text-white/60">{t("erp.hybrid.waiting", { n: data.waiting })}</p>}
    </Card>
  );
}
