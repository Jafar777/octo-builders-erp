"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Download, Play, Save, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { Button, Card, ErrorText, Input, PageHeader, Select, Toggle } from "@/components/erp/ui/fields";

const blank = (dataset) => ({ dataset, from: "", to: "", columns: [], filters: {}, groupBy: "", measure: { column: "", op: "count" } });

// Build a report from any list the person may see (tasks, overtime, leave, invoices,
// expenses, payments, leads, purchases, assets, projects): pick columns, filter, group
// with a total, see it as a chart, export to Excel, keep it for later.
export default function ReportBuilder() {
  const { t } = useLanguage();
  const [datasets, setDatasets] = useState([]);
  const [saved, setSaved] = useState([]);
  const [config, setConfig] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(null);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [error, setError] = useState("");

  const loadSaved = useCallback(() => api("/api/reports/saved").then((d) => setSaved(d.reports)).catch(() => {}), []);
  useEffect(() => {
    api("/api/reports/run")
      .then((d) => {
        setDatasets(d.datasets);
        if (d.datasets[0]) setConfig(blank(d.datasets[0].key));
      })
      .catch((err) => setError(errorText(t, err)));
    loadSaved();
  }, [loadSaved, t]);

  const ds = datasets.find((d) => d.key === config?.dataset);
  const cols = ds ? Object.keys(ds.columns) : [];
  const label = (k) => t(`erp.reports.col.${k}`);
  const set = (k, v) => setConfig((c) => ({ ...c, [k]: v }));

  async function run(cfg = config) {
    setBusy("run");
    setError("");
    try {
      setResult(await api("/api/reports/run", { method: "POST", body: cfg }));
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(null);
    }
  }

  async function exportXlsx() {
    setBusy("export");
    try {
      const labels = Object.fromEntries(cols.map((k) => [k, label(k)]));
      Object.assign(labels, { _group: label(config.groupBy || "group"), _value: t(`erp.reports.op.${config.measure.op}`), _count: t("erp.reports.op.count") });
      const res = await fetch("/api/reports/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...config, labels, title: t(`erp.reports.ds.${config.dataset}`) }) });
      if (!res.ok) throw new Error("server_error");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${t(`erp.reports.ds.${config.dataset}`)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setError("");
    try {
      await api("/api/reports/saved", { method: "POST", body: { name, shared, config } });
      setName("");
      loadSaved();
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  const max = Math.max(1, ...(result?.groups || []).map((g) => g.value));
  return (
    <div className="space-y-5">
      <PageHeader title={t("erp.nav.reports")} subtitle={t("erp.reports.subtitle")} />
      <ErrorText>{error}</ErrorText>

      {saved.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {saved.map((r) => (
            <span key={r.id} className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 ps-3 text-sm">
              <button
                type="button"
                onClick={() => {
                  const cfg = { ...blank(r.config.dataset), ...r.config };
                  setConfig(cfg);
                  run(cfg);
                }}
                className="py-1.5 hover:text-brand-orange"
              >
                {r.name}
                {r.shared && <span className="ms-1 text-[11px] text-white/60">{t("erp.reports.sharedTag")}</span>}
              </button>
              {r.mine && (
                <button
                  type="button"
                  aria-label={t("common.delete")}
                  onClick={async () => {
                    await api(`/api/reports/saved/${r.id}`, { method: "DELETE" }).catch(() => {});
                    loadSaved();
                  }}
                  className="px-2 text-white/55 hover:text-red-300"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {config && ds && (
        <Card>
          <div className="grid gap-3 sm:grid-cols-4">
            <Select
              label={t("erp.reports.dataset")}
              value={config.dataset}
              onChange={(v) => {
                setConfig(blank(v));
                setResult(null);
              }}
              options={datasets.map((d) => ({ value: d.key, label: t(`erp.reports.ds.${d.key}`) }))}
            />
            <Input label={t("erp.books.from")} type="date" value={config.from} onChange={(v) => set("from", v)} />
            <Input label={t("erp.books.to")} type="date" value={config.to} onChange={(v) => set("to", v)} />
            <p className="self-end pb-2 text-xs text-white/60">{t("erp.reports.dateOn", { col: label(ds.date) })}</p>
          </div>

          <p className="mb-2 mt-4 text-sm font-medium text-white/70">{t("erp.reports.columns")}</p>
          <div className="flex flex-wrap gap-2">
            {cols.map((k) => {
              const on = !config.columns.length || config.columns.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    const base = config.columns.length ? config.columns : cols;
                    set("columns", on ? base.filter((x) => x !== k) : [...base, k]);
                  }}
                  className={`rounded-full border px-3 py-1 text-xs ${on ? "border-brand-orange bg-brand-orange/15" : "border-white/10 text-white/60"}`}
                >
                  {label(k)}
                </button>
              );
            })}
          </div>

          <p className="mb-2 mt-4 text-sm font-medium text-white/70">{t("erp.reports.filters")}</p>
          <div className="grid gap-2 sm:grid-cols-4">
            {cols
              .filter((k) => ds.columns[k] === "text")
              .map((k) => (
                <Input key={k} value={config.filters[k] || ""} onChange={(v) => set("filters", { ...config.filters, [k]: v })} placeholder={label(k)} aria-label={label(k)} />
              ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Select label={t("erp.reports.groupBy")} value={config.groupBy} onChange={(v) => set("groupBy", v)} placeholder={t("erp.reports.noGroup")} options={cols.filter((k) => ds.columns[k] !== "number").map((k) => ({ value: k, label: label(k) }))} />
            <Select
              label={t("erp.reports.measure")}
              value={config.measure.column ? `${config.measure.op}:${config.measure.column}` : "count:"}
              onChange={(v) => {
                const [op, column] = v.split(":");
                set("measure", { op, column });
              }}
              options={[
                { value: "count:", label: t("erp.reports.op.count") },
                ...cols.filter((k) => ds.columns[k] === "number").flatMap((k) => ["sum", "avg"].map((op) => ({ value: `${op}:${k}`, label: `${t(`erp.reports.op.${op}`)} · ${label(k)}` }))),
              ]}
            />
            <div className="flex items-end gap-2">
              <Button onClick={() => run()} loading={busy === "run"}>
                <Play size={15} /> {t("erp.reports.run")}
              </Button>
              <Button variant="ghost" onClick={exportXlsx} loading={busy === "export"}>
                <Download size={15} /> Excel
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-white/10 pt-4">
            <div className="w-64">
              <Input label={t("erp.reports.saveAs")} value={name} onChange={setName} />
            </div>
            <Toggle checked={shared} onChange={setShared} label={t("erp.reports.share")} />
            <Button variant="ghost" onClick={save} disabled={!name}>
              <Save size={15} /> {t("common.save")}
            </Button>
          </div>
        </Card>
      )}

      {result?.groups && (
        <Card>
          <p className="mb-3 flex items-center gap-2 font-semibold">
            <BarChart3 size={16} className="text-white/60" /> {label(config.groupBy)}
          </p>
          <ul className="space-y-1.5">
            {result.groups.slice(0, 30).map((g) => (
              <li key={g.key} className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)_80px] items-center gap-3 text-sm">
                <span className="truncate">{g.key}</span>
                <span className="h-3 overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full rounded-full bg-brand-orange/80" style={{ width: `${(g.value / max) * 100}%` }} />
                </span>
                <span className="text-end tabular-nums">{g.value.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {result && (
        <Card>
          <p className="mb-2 text-xs text-white/60">{t("erp.reports.rows", { n: result.total })}</p>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 bg-brand-navy text-xs text-white/60">
                <tr className="border-b border-white/10">
                  {result.columns.map((c) => (
                    <th key={c.key} className="px-2 py-2 text-start font-medium">
                      {label(c.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.slice(0, 500).map((r, i) => (
                  <tr key={i} className="border-b border-white/5">
                    {result.columns.map((c) => (
                      <td key={c.key} className={`px-2 py-1.5 ${c.type === "number" ? "tabular-nums" : ""}`}>
                        {String(r[c.key] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.rows.length > 500 && <p className="mt-2 text-xs text-white/60">{t("erp.reports.moreInExcel")}</p>}
        </Card>
      )}
    </div>
  );
}
