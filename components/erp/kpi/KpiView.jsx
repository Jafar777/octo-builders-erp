"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Settings2, Trophy } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { api, errorText } from "@/lib/clientApi";
import Avatar from "@/components/erp/ui/Avatar";
import { Button, Card, ErrorText, PageHeader, Select } from "@/components/erp/ui/fields";
import { MonthPicker, monthLabel, money } from "@/components/erp/hr/hrUi";
import { GroupedBarChart, ScoreRing } from "@/components/erp/charts/BarChart";
import { Skeleton, SkeletonTable } from "@/components/erp/ui/Loading";
import BonusAlert from "@/components/erp/kpi/BonusAlert";
import TraineeBadge from "@/components/erp/ui/TraineeBadge";

const UNIT = { "%": "%", h: " h", "×": "" };

export default function KpiView({ initialMonth, meId }) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const [month, setMonth] = useState(initialMonth);
  const [userId, setUserId] = useState(meId);
  const [data, setData] = useState(null);
  const [metrics, setMetrics] = useState({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const d = await api(`/api/kpi?month=${month}&userId=${userId}`);
      // Managers who aren't ranked themselves open on the top of their leaderboard.
      if (!d.kpi && userId === meId && d.leaderboard.length) {
        setUserId(d.leaderboard[0].userId);
        return;
      }
      setData(d);
    } catch (err) {
      setError(errorText(t, err));
    }
  }, [month, userId, meId, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  useEffect(() => {
    api("/api/kpi/config").then((d) => setMetrics(d.metrics)).catch(() => {});
  }, []);

  const kpi = data?.kpi;
  const board = data?.leaderboard || [];

  return (
    <div>
      <PageHeader
        title={t("erp.nav.kpi")}
        subtitle={t("erp.kpi.subtitle")}
        actions={
          <>
            {board.length > 0 && (
              <div className="w-56">
                <Select value={userId} onChange={setUserId} options={board.map((b) => ({ value: b.userId, label: b.name }))} />
              </div>
            )}
            <MonthPicker month={month} onChange={setMonth} />
            {user?.permissions?.includes("kpi.manage") && (
              <Link href="/dashboard/kpi/config">
                <Button variant="ghost">
                  <Settings2 size={16} /> {t("erp.kpi.configure")}
                </Button>
              </Link>
            )}
          </>
        }
      />
      <ErrorText>{error}</ErrorText>
      {data?.bonus && (
        <div className="mb-6">
          <BonusAlert bonus={data.bonus} isMe={userId === meId} showLink />
        </div>
      )}

      {!data && !error && (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card className="flex flex-col items-center gap-4">
            <Skeleton className="h-32 w-32 rounded-full" />
            <Skeleton className="h-3 w-24" />
          </Card>
          <SkeletonTable rows={6} cols={4} />
        </div>
      )}
      {data && !kpi && <Card className="text-center text-white/55">{t("erp.kpi.noKpi")}</Card>}

      {kpi && (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <Card className="flex items-center gap-5">
              <ScoreRing score={kpi.score} target={data.config.target} />
              <div>
                <p className="text-lg font-semibold">{data.person?.name}</p>
                <p className="text-2xl font-bold text-brand-orange">{kpi.grade?.[lang]}</p>
                <p className="mt-1 text-sm text-white/60">
                  {t("erp.kpi.rank")} <span className="font-semibold text-white">{kpi.rank}</span> / {kpi.of}
                </p>
                <p className="text-xs text-white/40">{t("erp.kpi.target", { target: data.config.target })}</p>
                {kpi.bonus > 0 && <p className="mt-1 text-sm text-emerald-300">{t("erp.kpi.bonusShare")}: {money(kpi.bonus, data.bonusCurrency, lang)}</p>}
                {data.closed && <p className="mt-1 text-xs text-white/40">{t("erp.hr.closed")}</p>}
              </div>
            </Card>
            <Card>
              <p className="mb-3 text-sm font-medium text-white/70">{t("erp.kpi.trend")}</p>
              <GroupedBarChart
                unit="%"
                max={100}
                categories={kpi.indicators.map((i) => ({ key: i.key, label: i.name?.[lang] }))}
                series={data.trend.map((m) => ({
                  key: m.month,
                  label: monthLabel(m.month, lang),
                  values: Object.fromEntries(kpi.indicators.map((i) => [i.key, m.indicators.find((x) => x.key === i.key)?.percent ?? null])),
                }))}
              />
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {kpi.indicators.map((ind) => (
              <Card key={ind.key}>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">{ind.name?.[lang]}</p>
                  <p className="shrink-0 text-lg font-bold tabular-nums">
                    {ind.points}
                    <span className="text-sm text-white/40">/{ind.max}</span>
                  </p>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-[#3987e5]" style={{ width: `${ind.max ? (ind.points / ind.max) * 100 : 0}%` }} />
                </div>
                <div className="mt-4 space-y-2.5">
                  {ind.items.map((item) => (
                    <div key={item.key} className="flex items-start justify-between gap-3 text-sm">
                      <span className="text-white/70">{item.name?.[lang]}</span>
                      <span className="shrink-0 text-end">
                        <span className="block tabular-nums">
                          {item.points}/{item.max}
                        </span>
                        <span className="block text-xs tabular-nums text-white/40" dir="ltr">
                          {item.value === null ? t("erp.kpi.noData") : `${item.value}${UNIT[metrics[item.metric]?.unit] ?? ""}`}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {board.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-white/45">
            <Trophy size={15} /> {t("erp.kpi.leaderboard")}
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-white/[0.04] text-xs text-white/50">
                <tr>
                  <th className="px-3 py-2.5 text-start font-medium">#</th>
                  <th className="px-3 py-2.5 text-start font-medium">{t("auth.name")}</th>
                  <th className="px-3 py-2.5 text-start font-medium">{t("erp.kpi.score")}</th>
                  <th className="px-3 py-2.5 text-start font-medium">{t("erp.kpi.grade")}</th>
                  <th className="px-3 py-2.5 text-start font-medium">{t("erp.kpi.bonusShare")}</th>
                </tr>
              </thead>
              <tbody>
                {board.map((b) => (
                  <tr key={b.userId} onClick={() => setUserId(b.userId)} className={`cursor-pointer border-t border-white/5 hover:bg-white/[0.04] ${b.userId === userId ? "bg-white/[0.06]" : ""}`}>
                    <td className="px-3 py-2.5 tabular-nums">{b.rank}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2">
                        <Avatar name={b.name} src={b.avatarUrl} size={28} />
                        {b.name}
                        <TraineeBadge id={b.userId} />
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-24 rounded-full bg-white/[0.06]">
                          <span className="block h-full rounded-full bg-[#3987e5]" style={{ width: `${b.score}%` }} />
                        </span>
                        <span className="tabular-nums">{b.score}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5">{b.grade?.[lang]}</td>
                    <td className="px-3 py-2.5 tabular-nums">{b.bonus ? money(b.bonus, data.bonusCurrency, lang) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
