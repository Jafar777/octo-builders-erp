"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, Flame, ShieldAlert, Star, Trophy } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api } from "@/lib/clientApi";
import { formatDate, locale } from "@/lib/formatTime";
import Avatar from "@/components/erp/ui/Avatar";
import { StatTile } from "@/components/erp/hr/hrUi";
import { SkeletonCards } from "@/components/erp/ui/Loading";
import { taskHeading } from "@/components/erp/tasks/TaskRow";
import { useNow } from "@/components/erp/tasks/taskUi";

// Risk levels always come with an icon and a label, never colour alone.
const RISK = {
  critical: { cls: "bg-red-500/15 text-red-300", Icon: ShieldAlert },
  high: { cls: "bg-orange-500/15 text-orange-300", Icon: Flame },
  medium: { cls: "bg-amber-500/15 text-amber-200", Icon: AlertTriangle },
  healthy: { cls: "bg-emerald-500/15 text-emerald-300", Icon: CheckCircle2 },
};

const pct = (v) => (v === null || v === undefined ? "—" : `${v}%`);
const rateTone = (v, good = 80, ok = 60) => (v === null || v === undefined ? "" : v >= good ? "text-emerald-300" : v >= ok ? "text-amber-200" : "text-red-300");

function Panel({ title, icon: Icon, children }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h3 className="mb-4 flex items-center gap-2 font-semibold">
        {Icon && <Icon size={16} className="text-white/50" />} {title}
      </h3>
      {children}
    </section>
  );
}

function Group({ title, children }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/45">{title}</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">{children}</div>
    </div>
  );
}

// The numbers that matter under the projects timeline (see /api/work-projects/summary).
export default function ProjectsSummary() {
  const { t, lang } = useLanguage();
  const [data, setData] = useState(null);
  const now = useNow(true, 60000);

  const load = useCallback(() => {
    api("/api/work-projects/summary")
      .then(setData)
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  if (!data) {
    return (
      <div className="mt-10">
        <SkeletonCards count={6} />
      </div>
    );
  }

  const { month: m, now: n, projects: p } = data;
  const [y, mo] = m.month.split("-").map(Number);
  const monthName = new Intl.DateTimeFormat(locale(lang), { month: "long", year: "numeric" }).format(new Date(y, mo - 1, 1));
  const daysLate = (due) => Math.max(1, Math.floor((now - new Date(due).getTime()) / 86400000));

  return (
    <div className="mt-10 space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-white/10 pt-6">
        <h2 className="text-lg font-bold">{t("erp.summary.title", { month: monthName })}</h2>
        <p className="text-xs text-white/40">{t("erp.summary.scope")}</p>
      </div>

      <Group title={t("erp.summary.thisMonth")}>
        <StatTile label={t("erp.summary.created")} value={m.created} />
        <StatTile label={t("erp.summary.completed")} value={m.completed} tone="text-emerald-300" />
        <StatTile label={t("erp.summary.onTime")} value={pct(m.onTimeRate)} tone={rateTone(m.onTimeRate)} hint={t("erp.summary.onTimeHint")} />
        <StatTile label={t("erp.summary.withinScale")} value={pct(m.withinScaleRate)} tone={rateTone(m.withinScaleRate)} hint={t("erp.summary.withinScaleHint")} />
        <StatTile
          label={t("erp.summary.rejection")}
          value={pct(m.rejectionRate)}
          tone={m.rejectionRate === null ? "" : m.rejectionRate <= 10 ? "text-emerald-300" : m.rejectionRate <= 25 ? "text-amber-200" : "text-red-300"}
          hint={t("erp.summary.rejectedCount", { n: m.rejected })}
        />
        <StatTile label={t("erp.summary.hoursWorked")} value={t("erp.scale.hours", { h: m.hoursWorked })} hint={t("erp.summary.hoursHint")} />
      </Group>

      <Group title={t("erp.summary.rightNow")}>
        <StatTile label={t("erp.summary.open")} value={n.open} />
        <StatTile label={t("erp.summary.inProgress")} value={n.inProgress} tone="text-sky-300" />
        <StatTile label={t("erp.summary.waitingReview")} value={n.waitingReview} tone={n.waitingReview ? "text-brand-orange" : ""} />
        <StatTile label={t("erp.summary.onHold")} value={n.onHold} tone={n.onHold ? "text-amber-200" : ""} />
        <StatTile label={t("erp.summary.overdue")} value={n.overdue} tone={n.overdue ? "text-red-300" : "text-emerald-300"} />
        <StatTile label={t("erp.summary.dueSoon")} value={n.dueSoon} hint={t("erp.summary.dueSoonHint")} />
      </Group>

      <Group title={t("erp.summary.projectsTitle")}>
        <StatTile label={t("erp.summary.active")} value={p.active} hint={p.onHold ? t("erp.summary.onHoldProjects", { n: p.onHold }) : undefined} />
        <StatTile label={t("erp.summary.avgProgress")} value={pct(p.avgProgress)} />
        <StatTile label={t("erp.summary.lateProjects")} value={p.late} tone={p.late ? "text-red-300" : "text-emerald-300"} />
        <StatTile label={t("erp.summary.atRisk")} value={p.atRisk} tone={p.atRisk ? "text-orange-300" : "text-emerald-300"} />
        <StatTile label={t("erp.summary.dueThisMonth")} value={p.dueThisMonth} />
        <StatTile label={t("erp.summary.finishedThisMonth")} value={p.finishedThisMonth} tone={p.finishedThisMonth ? "text-emerald-300" : ""} />
      </Group>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title={t("erp.summary.watch")} icon={ShieldAlert}>
          <div className="space-y-3">
            {data.watch.map((w) => {
              const r = RISK[w.risk] || RISK.healthy;
              return (
                <Link key={w.id} href={`/dashboard/projects/${w.id}`} className="block rounded-xl p-2 -m-2 hover:bg-white/5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-medium">{w.name?.[lang]}</span>
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${r.cls}`}>
                      <r.Icon size={11} /> {t(`erp.analytics.level.${w.risk}`)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-brand-orange" style={{ width: `${w.progress}%` }} />
                  </div>
                  <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-white/45">
                    <span dir="ltr">{w.progress}%</span>
                    <span className={w.late ? "text-red-300" : ""}>
                      <CalendarClock size={11} className="me-0.5 inline" /> {formatDate(w.dueDate, lang)}
                    </span>
                    {w.reason !== "none" && <span>{t(`erp.analytics.reason.${w.reason}`)}</span>}
                  </p>
                </Link>
              );
            })}
            {data.watch.length === 0 && <p className="text-sm text-white/40">{t("erp.projects.none")}</p>}
          </div>
        </Panel>

        <Panel title={t("erp.summary.overdueTasks")} icon={AlertTriangle}>
          <div className="space-y-2.5">
            {data.overdue.map((task) => (
              <Link key={task.id} href={`/dashboard/tasks?task=${task.id}`} className="-m-2 flex items-start gap-3 rounded-xl p-2 hover:bg-white/5">
                <Avatar name={task.assignee?.name} src={task.assignee?.avatarUrl} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    <span className="text-white/40" dir="ltr">
                      #{task.number}
                    </span>{" "}
                    {taskHeading(task, lang)}
                  </span>
                  <span className="block truncate text-[11px] text-white/45">{[task.project?.name?.[lang], task.assignee?.name].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] text-red-300">{t("erp.summary.daysLate", { n: daysLate(task.dueAt) })}</span>
              </Link>
            ))}
            {data.overdue.length === 0 && (
              <p className="flex items-center gap-2 text-sm text-emerald-300">
                <CheckCircle2 size={15} /> {t("erp.summary.noOverdue")}
              </p>
            )}
          </div>
        </Panel>

        <Panel title={t("erp.summary.top")} icon={Trophy}>
          <div className="space-y-2.5">
            {data.top.map((person, i) => (
              <div key={person.id} className="flex items-center gap-3">
                <span className="w-4 text-center text-xs text-white/40">{i + 1}</span>
                <Avatar name={person.name} src={person.avatarUrl} size={28} />
                <span className="min-w-0 flex-1 truncate text-sm">{person.name}</span>
                <span className="shrink-0 text-xs text-white/60">{t("erp.summary.doneCount", { n: person.completed })}</span>
                {person.onTimeRate !== null && <span className={`w-10 shrink-0 text-end text-xs ${rateTone(person.onTimeRate)}`}>{person.onTimeRate}%</span>}
                {person.stars !== null && (
                  <span className="flex shrink-0 items-center gap-0.5 text-xs text-amber-300" dir="ltr">
                    <Star size={11} fill="currentColor" /> {person.stars}
                  </span>
                )}
              </div>
            ))}
            {data.top.length === 0 && <p className="text-sm text-white/40">{t("erp.summary.noCompleted")}</p>}
          </div>
          {data.top.length > 0 && <p className="mt-3 text-[11px] text-white/35">{t("erp.summary.topHint")}</p>}
        </Panel>
      </div>
    </div>
  );
}
