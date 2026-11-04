"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatMoney } from "@/components/erp/intake/MoneyFields";
import Avatar from "@/components/erp/ui/Avatar";
import { Card, ErrorText, Input } from "@/components/erp/ui/fields";

// How much of each person's available time went into project work this month.
// Healthy for a design studio: about 75–85%. Above 95% means no slack for revisions.
export default function Utilization() {
  const { t, lang } = useLanguage();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/api/analytics/utilization?month=${month}`)
      .then(setData)
      .catch((err) => setError(errorText(t, err)));
  }, [month, t]);

  const tone = (u) => (u === null ? "bg-white/20" : u > 95 ? "bg-red-400" : u >= 70 ? "bg-emerald-400" : u >= 50 ? "bg-amber-400" : "bg-white/40");
  const withCost = data?.people.some((p) => p.cost !== undefined);
  const avg = data?.people.length ? Math.round(data.people.reduce((s, p) => s + (p.utilization || 0), 0) / data.people.length) : null;

  return (
    <Card className="mt-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-semibold">{t("erp.utilization.title")}</p>
          <p className="mt-1 text-sm text-white/50">{t("erp.utilization.hint", { hours: data?.monthHours ?? "—" })}</p>
        </div>
        <div className="flex items-end gap-4">
          {avg !== null && (
            <div className="text-end">
              <p className="text-2xl font-semibold tabular-nums">{avg}%</p>
              <p className="text-xs text-white/60">{t("erp.utilization.average")}</p>
            </div>
          )}
          <div className="w-44">
            <Input type="month" value={month} onChange={setMonth} aria-label={t("erp.utilization.month")} />
          </div>
        </div>
      </div>
      <ErrorText>{error}</ErrorText>
      <ul className="space-y-2">
        {data?.people.map((p) => (
          <li key={p.person} className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <Avatar name={p.name} src={p.avatarUrl} size={26} />
              <span className="truncate">{p.name}</span>
            </span>
            <span className="relative h-2.5 overflow-hidden rounded-full bg-white/10" title={`${p.projectHours} / ${p.available}`}>
              <span className={`absolute inset-y-0 start-0 rounded-full ${tone(p.utilization)}`} style={{ width: `${Math.min(100, p.utilization || 0)}%` }} />
            </span>
            <span className="flex gap-3 text-xs tabular-nums text-white/60">
              <span className="w-10 text-end font-semibold text-white">{p.utilization === null ? "—" : `${p.utilization}%`}</span>
              <span className="w-24 text-end">{t("erp.utilization.hours", { n: p.projectHours })}</span>
              {withCost && <span className="w-24 text-end">{formatMoney(Math.round(p.cost || 0), data.base, lang)}</span>}
            </span>
          </li>
        ))}
      </ul>
      {data && !data.people.length && <p className="text-sm text-white/60">{t("erp.utilization.none")}</p>}
    </Card>
  );
}
