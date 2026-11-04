"use client";

import { useCallback, useEffect, useState } from "react";
import { Medal, Megaphone, Plus, Trash2, Trophy } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import Avatar from "@/components/erp/ui/Avatar";
import { Button, Card, ErrorText, Input, Label, PageHeader, Select, Toggle } from "@/components/erp/ui/fields";
import { MonthPicker, money } from "@/components/erp/hr/hrUi";
import { SkeletonCards } from "@/components/erp/ui/Loading";
import BonusAlert from "@/components/erp/kpi/BonusAlert";
import TraineeBadge from "@/components/erp/ui/TraineeBadge";

const MEDAL = ["text-amber-300", "text-slate-200", "text-orange-300"];

// GM: this month's pool, how it's split between the places, and a message for employees.
function ManageBonus({ data, month, onSaved }) {
  const { t, lang } = useLanguage();
  const [form, setForm] = useState({
    bonusPool: String(data.pool || ""),
    bonusCurrency: data.currency,
    bonusSplit: data.split.map(String),
    bonusNote: data.note,
    announce: !data.pool,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));
  const setPlace = (i) => (v) => setForm((f) => ({ ...f, bonusSplit: f.bonusSplit.map((x, j) => (j === i ? v : x)) }));
  const total = form.bonusSplit.reduce((a, b) => a + (Number(b) || 0), 0);
  const pool = Number(form.bonusPool) || 0;

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("/api/bonus", {
        method: "PATCH",
        body: {
          month,
          bonusPool: pool,
          bonusCurrency: form.bonusCurrency,
          bonusSplit: form.bonusSplit.map((x) => Number(x) || 0),
          bonusNote: form.bonusNote,
          announce: form.announce,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setForm((f) => ({ ...f, announce: false }));
      onSaved();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-5">
      <h2 className="text-lg font-semibold">{t("erp.bonus.manageTitle")}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input type="number" min="0" label={t("erp.bonus.pool")} value={form.bonusPool} onChange={set("bonusPool")} dir="ltr" />
        <Select label={t("erp.bonus.currency")} value={form.bonusCurrency} onChange={set("bonusCurrency")} options={data.currencies.map((c) => ({ value: c, label: c }))} />
      </div>

      <div>
        <Label>{t("erp.bonus.split")}</Label>
        <div className="space-y-2">
          {form.bonusSplit.map((v, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
              <span className={`flex w-24 shrink-0 items-center gap-1.5 text-sm font-semibold ${MEDAL[i] || "text-white/70"}`}>
                <Medal size={15} className="shrink-0" /> {t("erp.bonus.place", { n: i + 1 })}
              </span>
              {/* Number and "%" side by side in one box (left-to-right in both languages). */}
              <div dir="ltr" className="flex w-24 shrink-0 items-center overflow-hidden rounded-lg border border-white/10 bg-white/5 focus-within:border-white/30">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={v}
                  onChange={(e) => setPlace(i)(e.target.value)}
                  aria-label={t("erp.bonus.place", { n: i + 1 })}
                  className="w-full min-w-0 bg-transparent px-2.5 py-2 text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="border-s border-white/10 px-2 text-sm text-white/60">%</span>
              </div>
              <span className="min-w-0 flex-1 truncate text-end text-sm font-medium tabular-nums text-white/80">
                {money(Math.round(pool * (Number(v) || 0)) / 100, form.bonusCurrency, lang)}
              </span>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, bonusSplit: f.bonusSplit.filter((_, j) => j !== i) }))}
                disabled={form.bonusSplit.length <= 1}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-30"
                aria-label={t("common.delete")}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {form.bonusSplit.length < 10 && (
            <Button variant="ghost" onClick={() => setForm((f) => ({ ...f, bonusSplit: [...f.bonusSplit, "0"] }))}>
              <Plus size={15} /> {t("erp.bonus.addPlace")}
            </Button>
          )}
          <span className={`text-xs ${total > 100 ? "text-red-300" : "text-white/60"}`}>{t("erp.bonus.splitTotal", { n: total })}</span>
        </div>
      </div>

      <div>
        <Label>{t("erp.bonus.note")}</Label>
        <textarea
          rows={3}
          value={form.bonusNote}
          onChange={(e) => set("bonusNote")(e.target.value)}
          placeholder={t("erp.bonus.notePlaceholder")}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-white/30"
        />
      </div>

      <Toggle checked={form.announce} onChange={set("announce")} label={t("erp.bonus.announce")} />
      <ErrorText>{error}</ErrorText>
      <div className="flex items-center gap-3">
        <Button onClick={save} loading={busy} disabled={total > 100}>
          {form.announce && <Megaphone size={15} />} {t("common.save")}
        </Button>
        {saved && <span className="text-sm text-emerald-300">{t("common.saved")}</span>}
      </div>
    </Card>
  );
}

// Bonus page: everyone sees the month's prizes and what they need; the GM sets them.
export default function BonusPage({ initialMonth }) {
  const { t, lang } = useLanguage();
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await api(`/api/bonus?month=${month}`));
    } catch (err) {
      setError(errorText(t, err));
    }
  }, [month, t]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return (
    <div className="max-w-5xl">
      <PageHeader title={t("erp.nav.bonus")} subtitle={t("erp.bonus.subtitle")} actions={<MonthPicker month={month} onChange={setMonth} />} />
      <ErrorText>{error}</ErrorText>
      {!data && !error && <SkeletonCards count={3} />}

      {data && data.month === month && (
        <div className="space-y-6">
          {/* The prizes */}
          <div className="grid gap-3 sm:grid-cols-3">
            {data.places.map((p) => (
              <Card key={p.place} className="text-center">
                <Trophy size={26} className={`mx-auto ${MEDAL[p.place - 1] || "text-white/60"}`} />
                <p className="mt-2 text-sm text-white/60">{t("erp.bonus.place", { n: p.place })}</p>
                <p className="text-2xl font-bold tabular-nums">{data.pool ? money(p.amount, data.currency, lang) : "—"}</p>
                <p className="text-xs text-white/60">{t("erp.bonus.ofPool", { n: p.percent })}</p>
                {p.scoreToBeat !== null && (
                  <p className="mt-2 text-xs text-white/55">
                    {t("erp.bonus.scoreAtPlace", { score: p.scoreToBeat })}
                    {p.holderName ? ` · ${p.holderName}` : ""}
                  </p>
                )}
              </Card>
            ))}
          </div>

          <BonusAlert bonus={data} />

          {data.canManage && !data.closed && <ManageBonus key={`${month}-${data.pool}-${data.split.join()}`} data={data} month={month} onSaved={load} />}
          {data.canManage && data.closed && <p className="text-sm text-white/60">{t("erp.bonus.closedEdit")}</p>}

          {data.ranking.length > 0 && (
            <Card className="overflow-x-auto p-0">
              <p className="px-5 pt-5 font-semibold">{t("erp.bonus.ranking")}</p>
              <table className="mt-3 w-full min-w-[480px] text-sm">
                <thead className="bg-white/[0.04] text-xs text-white/55">
                  <tr>
                    <th className="px-4 py-2.5 text-start font-medium">#</th>
                    <th className="px-4 py-2.5 text-start font-medium">{t("erp.bonus.person")}</th>
                    <th className="px-4 py-2.5 text-start font-medium">{t("erp.bonus.score")}</th>
                    <th className="px-4 py-2.5 text-start font-medium">{t("erp.kpi.bonusShare")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ranking.map((r) => (
                    <tr key={r.userId} className={`border-t border-white/5 ${r.bonus ? "bg-amber-400/[0.04]" : ""}`}>
                      <td className={`px-4 py-2.5 font-semibold ${MEDAL[r.rank - 1] || "text-white/60"}`}>{r.rank}</td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2">
                          <Avatar name={r.name} src={r.avatarUrl} size={24} /> {r.name}
                          <TraineeBadge id={r.userId} />
                        </span>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">{r.score}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.bonus ? money(r.bonus, data.currency, lang) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
