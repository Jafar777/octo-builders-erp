"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertOctagon, AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ChevronDown, CircleAlert, Timer } from "lucide-react";
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
import TraineeBadge from "@/components/erp/ui/TraineeBadge";

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

// Same thresholds as ProjectScore.
const kpiTone = (v) => (v === null || v === undefined ? "text-white/30" : v >= 80 ? "text-emerald-300" : v >= 60 ? "text-amber-300" : "text-red-300");
const avg = (list) => {
  const vals = list.filter((v) => v !== null && v !== undefined);
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
};
const pct = (v) => (v === null || v === undefined ? "—" : `${v}%`);
const isFinished = (p) => p.status === "finished";

// Sortable project columns; `value` is what the column sorts by.
const PROJECT_COLS = [
  { key: "project", value: (p, lang) => p.name?.[lang] || "" },
  { key: "score", value: (p) => p.kpi?.score },
  { key: "delivery", value: (p) => p.kpi?.delivery },
  { key: "schedule", value: (p) => p.kpi?.schedule },
  { key: "quality", value: (p) => p.kpi?.quality },
  { key: "cost", value: (p) => p.kpi?.cost },
  { key: "risk", value: (p) => p.score },
  { key: "progress", value: (p) => p.progress },
  { key: "due", value: (p) => new Date(p.dueDate).getTime() },
  { key: "late", value: (p) => p.lateTasks },
  { key: "rejections", value: (p) => p.rejections },
  { key: "tasks", value: (p) => p.openTasks },
  { key: "hours", value: (p) => p.hoursWorked },
  { key: "team", value: (p) => p.participants },
];
const HOW = ["score", "delivery", "schedule", "quality", "cost", "risk", "progress", "counted"];

function KpiCell({ value }) {
  return <span className={`tabular-nums ${kpiTone(value)}`}>{pct(value)}</span>;
}

// Progress, with a marker at the share of the project's time already used.
function ProgressCell({ p, t }) {
  const behind = !isFinished(p) && p.elapsed - p.progress > 25;
  return (
    <span className="block w-36" title={isFinished(p) ? undefined : t("erp.analytics.progressHint", { progress: p.progress, elapsed: p.elapsed })}>
      <span className="flex items-center justify-between text-xs tabular-nums">
        <span>{p.progress}%</span>
        <span className="text-white/40" dir="ltr">
          {p.stagesDone}/{p.stagesTotal}
        </span>
      </span>
      <span className="relative mt-1 block h-1.5 rounded-full bg-white/[0.06]">
        <span className={`block h-full rounded-full ${behind ? "bg-red-400" : "bg-[#3987e5]"}`} style={{ width: `${p.progress}%` }} />
        {!isFinished(p) && <span className="absolute -top-0.5 h-2.5 w-0.5 rounded bg-white/70" style={{ insetInlineStart: `${Math.min(100, p.elapsed)}%` }} />}
      </span>
    </span>
  );
}

export default function Analytics() {
  const { t, lang } = useLanguage();
  const lookups = useTaskLookups();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("active");
  const [sort, setSort] = useState({ key: "risk", dir: -1 });
  const [showHow, setShowHow] = useState(false);

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

  const projects = useMemo(() => {
    const list = (data?.health || []).filter((p) => (tab === "finished") === isFinished(p));
    const col = PROJECT_COLS.find((c) => c.key === sort.key);
    return list.slice().sort((a, b) => {
      const va = col.value(a, lang);
      const vb = col.value(b, lang);
      // Projects without that figure go last, whichever way.
      if (va === null || va === undefined) return vb === null || vb === undefined ? 0 : 1;
      if (vb === null || vb === undefined) return -1;
      return (typeof va === "string" ? va.localeCompare(vb) : va - vb) * sort.dir;
    });
  }, [data, tab, sort, lang]);

  const summary = useMemo(() => {
    const all = data?.health || [];
    const live = all.filter((p) => !isFinished(p));
    return {
      live: live.length,
      finished: all.length - live.length,
      score: avg(live.map((p) => p.kpi?.score)),
      delivery: avg(live.map((p) => p.kpi?.delivery)),
      quality: avg(live.map((p) => p.kpi?.quality)),
      atRisk: live.filter((p) => ["high", "critical"].includes(p.level)).length,
      overdue: live.filter((p) => p.daysLeft < 0).length,
    };
  }, [data]);

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: key === "project" || key === "due" ? 1 : -1 }));

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

      {/* Projects at a glance (running projects) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label={t("erp.analytics.activeProjects")} value={c.activeProjects} />
        <StatTile label={t("erp.analytics.avgScore")} value={summary.score ?? "—"} tone={kpiTone(summary.score)} />
        <StatTile label={t("erp.analytics.kpiPart.delivery")} value={pct(summary.delivery)} tone={kpiTone(summary.delivery)} />
        <StatTile label={t("erp.analytics.kpiPart.quality")} value={pct(summary.quality)} tone={kpiTone(summary.quality)} />
        <StatTile label={t("erp.analytics.atRisk")} value={summary.atRisk} tone={summary.atRisk ? "text-red-300" : ""} />
        <StatTile label={t("erp.analytics.overdueProjects")} value={summary.overdue} tone={summary.overdue ? "text-red-300" : ""} />
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-white/70">{t("erp.analytics.projectHealth")}</p>
          <div className="flex rounded-xl border border-white/10 p-1 text-sm">
            {["active", "finished"].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`rounded-lg px-3 py-1.5 ${tab === k ? "bg-white/10 text-white" : "text-white/55 hover:text-white"}`}
              >
                {t(`erp.analytics.tab.${k}`)} ({k === "finished" ? summary.finished : summary.live})
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="text-xs text-white/50">
              <tr>
                {PROJECT_COLS.map((col) => (
                  <th key={col.key} className="whitespace-nowrap px-2 pb-2 text-start font-medium">
                    <button type="button" onClick={() => toggleSort(col.key)} className="inline-flex items-center gap-1 hover:text-white">
                      {t(`erp.analytics.col.${col.key}`)}
                      {sort.key === col.key && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const L = LEVEL[p.level];
                return (
                  <tr key={p.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                    <td className="px-2 py-2.5">
                      <Link href={`/dashboard/projects/${p.id}`} className="font-medium hover:text-brand-orange">
                        {p.name?.[lang]}
                      </Link>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-white/40">
                        {p.code && <span dir="ltr">{p.code}</span>}
                        {p.department && <span>{lookups.departmentName(p.department)}</span>}
                        {p.status === "on_hold" && <span className="rounded-full bg-amber-500/15 px-2 text-amber-300">{t("erp.projects.status.on_hold")}</span>}
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="text-base">
                        <ProjectScore kpi={p.kpi} />
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      <KpiCell value={p.kpi?.delivery} />
                    </td>
                    <td className="px-2 py-2.5">
                      <KpiCell value={p.kpi?.schedule} />
                    </td>
                    <td className="px-2 py-2.5">
                      <KpiCell value={p.kpi?.quality} />
                    </td>
                    <td className="px-2 py-2.5">
                      <KpiCell value={p.kpi?.cost} />
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: L.color }}>
                        <L.Icon size={14} />
                        <span className="text-white/85">{t(`erp.analytics.level.${p.level}`)}</span>
                        <span className="tabular-nums text-white/45">{p.score}</span>
                      </span>
                      {p.reason !== "none" && <span className="mt-0.5 block text-[11px] text-white/45">{t(`erp.analytics.reason.${p.reason}`)}</span>}
                    </td>
                    <td className="px-2 py-2.5">
                      <ProgressCell p={p} t={t} />
                    </td>
                    <td className={`whitespace-nowrap px-2 py-2.5 text-xs ${p.daysLeft < 0 ? "text-red-300" : "text-white/60"}`}>
                      {formatDate(p.dueDate, lang)}
                      <span className="block text-[11px]">
                        {isFinished(p)
                          ? [t("erp.analytics.finishedOn", { date: formatDate(p.finishedAt, lang) }), p.daysLeft < 0 ? t("erp.analytics.daysLate", { n: -p.daysLeft }) : ""]
                              .filter(Boolean)
                              .join(" · ")
                          : p.daysLeft < 0
                            ? t("erp.analytics.daysLate", { n: -p.daysLeft })
                            : t("erp.analytics.daysLeft", { n: p.daysLeft })}
                      </span>
                    </td>
                    <td className={`px-2 py-2.5 tabular-nums ${p.lateTasks ? "text-red-300" : ""}`}>{p.lateTasks}</td>
                    <td className={`px-2 py-2.5 tabular-nums ${p.rejections ? "text-amber-300" : ""}`}>{p.rejections}</td>
                    <td className="px-2 py-2.5 tabular-nums" dir="ltr">
                      {p.openTasks} <span className="text-white/40">/ {p.totalTasks}</span>
                    </td>
                    <td className="px-2 py-2.5 tabular-nums" dir="ltr">
                      {p.hoursWorked}h
                    </td>
                    <td className="px-2 py-2.5 tabular-nums">{p.participants}</td>
                  </tr>
                );
              })}
              {projects.length === 0 && (
                <tr>
                  <td colSpan={PROJECT_COLS.length} className="py-8 text-center text-white/40">
                    {t("erp.projects.none")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* How the numbers are made */}
        <button type="button" onClick={() => setShowHow((v) => !v)} className="mt-4 flex items-center gap-1 text-xs text-white/50 hover:text-white">
          <ChevronDown size={14} className={`transition-transform ${showHow ? "rotate-180" : ""}`} />
          {t("erp.analytics.how.title")}
        </button>
        {showHow && (
          <ul className="mt-2 space-y-1.5 rounded-xl bg-white/[0.03] p-4 text-xs leading-relaxed text-white/60">
            {HOW.map((k) => (
              <li key={k}>
                <span className="font-semibold text-white/80">{t(`erp.analytics.how.${k}Label`)}:</span> {t(`erp.analytics.how.${k}`)}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* The tasks behind the projects */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
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

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <p className="mb-4 text-sm font-medium text-white/70">{t("erp.analytics.team")}</p>
          <div className="space-y-2">
            {data.team.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2 text-sm">
                <Avatar name={m.name} src={m.avatarUrl} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-medium">
                    <span className="truncate">{m.name}</span>
                    <TraineeBadge id={m.id} />
                  </p>
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
