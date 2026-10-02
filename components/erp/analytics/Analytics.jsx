"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertOctagon, AlertTriangle, CheckCircle2, CircleAlert, Timer } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import ProjectScore from "@/components/erp/projects/ProjectScore";
import { usePollingFallback } from "@/context/RealtimeContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDate } from "@/lib/formatTime";
import Avatar from "@/components/erp/ui/Avatar";
import { Card, ErrorText, PageHeader } from "@/components/erp/ui/fields";
import { GroupedBarChart, HorizontalBars } from "@/components/erp/charts/BarChart";
import { StatTile, monthLabel } from "@/components/erp/hr/hrUi";
import { useTaskLookups } from "@/components/erp/tasks/useTaskLookups";
import { PageSkeleton, SkeletonChart } from "@/components/erp/ui/Loading";

// Status palette (fixed) — always paired with an icon and a text label.
const LEVEL = {
  healthy: { color: "#0ca30c", Icon: CheckCircle2 },
  medium: { color: "#fab219", Icon: CircleAlert },
  high: { color: "#ec835a", Icon: AlertTriangle },
  critical: { color: "#d03b3b", Icon: AlertOctagon },
};

const PRESENCE = {
  present: "text-emerald-300",
  not_in: "text-white/45",
  annual_leave: "text-sky-300",
  sick_leave: "text-sky-300",
  unpaid_leave: "text-amber-300",
  no_badge: "text-white/30",
};

export default function Analytics() {
  const { t, lang } = useLanguage();
  const lookups = useTaskLookups();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api("/api/analytics"));
    } catch (err) {
      setError(errorText(t, err));
    }
  }, [t]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  usePollingFallback(load, 60000);

  if (!data)
    return error ? (
      <ErrorText>{error}</ErrorText>
    ) : (
      <div className="space-y-6">
        <PageSkeleton tiles={6} />
        <SkeletonChart />
      </div>
    );
  const c = data.counters;
  const types = Object.entries(data.byType)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => ({ key, label: lookups.typeName(key), value }));

  return (
    <div className="space-y-6">
      <PageHeader title={t("erp.nav.analytics")} subtitle={t("erp.analytics.subtitle")} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label={t("erp.analytics.activeProjects")} value={c.activeProjects} />
        <StatTile label={t("erp.analytics.openTasks")} value={c.open} />
        <StatTile label={t("erp.analytics.waitingReview")} value={c.submitted} />
        <StatTile label={t("erp.analytics.overdue")} value={c.overdue} tone={c.overdue ? "text-red-300" : ""} />
        <StatTile label={t("erp.analytics.approvedMonth")} value={c.approvedThisMonth} />
        <StatTile label={t("erp.analytics.rejectedMonth")} value={c.rejectedThisMonth} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <p className="mb-3 text-sm font-medium text-white/70">{t("erp.analytics.reviewTrend")}</p>
          <GroupedBarChart
            categories={data.trend.map((m) => ({ key: m.month, label: monthLabel(m.month, lang) }))}
            series={[
              { key: "approved", label: t("erp.tasks.status.approved"), values: Object.fromEntries(data.trend.map((m) => [m.month, m.approved])) },
              { key: "rejected", label: t("erp.tasks.status.rejected"), values: Object.fromEntries(data.trend.map((m) => [m.month, m.rejected])) },
            ]}
          />
        </Card>
        <Card>
          <p className="mb-4 text-sm font-medium text-white/70">{t("erp.analytics.taskMix")}</p>
          {types.length ? <HorizontalBars items={types} /> : <p className="py-10 text-center text-sm text-white/40">{t("erp.kpi.noData")}</p>}
        </Card>
      </div>

      <Card>
        <p className="mb-4 text-sm font-medium text-white/70">{t("erp.analytics.projectHealth")}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-xs text-white/50">
              <tr>
                {["project", "risk", "reason", "progress", "score", "due", "late", "rejections", "open"].map((h) => (
                  <th key={h} className="px-2 pb-2 text-start font-medium">{t(`erp.analytics.col.${h}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.health.map((p) => {
                const L = LEVEL[p.level];
                return (
                  <tr key={p.id} className="border-t border-white/5">
                    <td className="px-2 py-2.5">
                      <Link href={`/dashboard/projects/${p.id}`} className="font-medium hover:text-brand-orange">{p.name?.[lang]}</Link>
                      {p.code && <span className="ms-2 text-xs text-white/40">{p.code}</span>}
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: L.color }}>
                        <L.Icon size={14} />
                        <span className="text-white/85">{t(`erp.analytics.level.${p.level}`)}</span>
                        <span className="tabular-nums text-white/45">{p.score}</span>
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-xs text-white/60">{p.level === "healthy" ? "—" : t(`erp.analytics.reason.${p.reason}`)}</td>
                    <td className="px-2 py-2.5">
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-20 rounded-full bg-white/[0.06]">
                          <span className="block h-full rounded-full bg-[#3987e5]" style={{ width: `${p.progress}%` }} />
                        </span>
                        <span className="tabular-nums text-xs">{p.progress}%</span>
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      <ProjectScore kpi={p.kpi} />
                    </td>
                    <td className={`px-2 py-2.5 text-xs ${p.daysLeft < 0 ? "text-red-300" : "text-white/60"}`}>
                      {formatDate(p.dueDate, lang)} ({p.daysLeft < 0 ? t("erp.analytics.daysLate", { n: -p.daysLeft }) : t("erp.analytics.daysLeft", { n: p.daysLeft })})
                    </td>
                    <td className="px-2 py-2.5 tabular-nums">{p.lateTasks}</td>
                    <td className="px-2 py-2.5 tabular-nums">{p.rejections}</td>
                    <td className="px-2 py-2.5 tabular-nums">{p.openTasks}</td>
                  </tr>
                );
              })}
              {data.health.length === 0 && (
                <tr><td colSpan={9} className="py-8 text-center text-white/40">{t("erp.projects.none")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <p className="mb-4 text-sm font-medium text-white/70">{t("erp.analytics.team")}</p>
          <div className="space-y-2">
            {data.team.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2 text-sm">
                <Avatar name={m.name} src={m.avatarUrl} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.name}</p>
                  <p className="truncate text-xs text-white/45">
                    {m.workingOn ? (
                      <span className="inline-flex items-center gap-1 text-sky-300">
                        <Timer size={12} /> #{m.workingOn.number} {m.workingOn.title}
                      </span>
                    ) : (
                      t("erp.analytics.notWorking")
                    )}
                  </p>
                </div>
                <span className={`text-xs ${PRESENCE[m.presence]}`}>{t(`erp.analytics.presence.${m.presence}`)}</span>
                <span className="w-24 text-end text-xs text-white/55">
                  {t("erp.analytics.tasksHours", { tasks: m.openTasks, hours: m.reservedHours })}
                </span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <p className="mb-1 text-sm font-medium text-white/70">{t("erp.analytics.capacity")}</p>
          <p className="mb-4 text-xs text-white/40">{t("erp.analytics.capacityHint")}</p>
          <div className="space-y-5">
            {data.capacity.map((d) => (
              <div key={d.department}>
                <p className="mb-2 text-sm font-medium">
                  {lookups.departmentName(d.department)} <span className="text-xs text-white/40">· {d.people} {t("erp.analytics.people")}</span>
                </p>
                <div className="space-y-2">
                  {d.months.map((m) => {
                    const tone = m.load > 100 ? "#d03b3b" : m.load > 85 ? "#fab219" : "#3987e5";
                    return (
                      <div key={m.month} className="grid grid-cols-[90px_1fr_auto] items-center gap-3 text-xs" title={`${m.reserved} / ${m.available} h`}>
                        <span className="text-white/60">{monthLabel(m.month, lang)}</span>
                        <span className="h-2 rounded-full bg-white/[0.06]">
                          <span className="block h-full rounded-full" style={{ width: `${Math.min(100, m.load)}%`, background: tone }} />
                        </span>
                        <span className="tabular-nums text-white/75" dir="ltr">
                          {m.reserved}/{m.available}h · {m.load}%
                          {m.load > 100 && <span className="ms-1 text-red-300">{t("erp.analytics.overloaded")}</span>}
                          {m.load > 85 && m.load <= 100 && <span className="ms-1 text-amber-300">{t("erp.analytics.nearFull")}</span>}
                          {m.load < 30 && <span className="ms-1 text-white/45">{t("erp.analytics.idle")}</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
