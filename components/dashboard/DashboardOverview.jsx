"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  Flame,
  Loader2,
  ShieldAlert,
  UserPlus,
  Wallet,
  WifiOff,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { usePollingFallback, useRealtimeEvent, userChannelName } from "@/context/RealtimeContext";
import { api, errorText, peekApi } from "@/lib/clientApi";
import { formatDate, formatDateTime, formatRelative, locale } from "@/lib/formatTime";
import { namesComplete } from "@/components/erp/staff/NameFields";
import { ErrorText, Input } from "@/components/erp/ui/fields";
import CheckInCard from "@/components/erp/hr/CheckInCard";
import { hm, money, StatTile } from "@/components/erp/hr/hrUi";
import { StatusBadge, TaskName } from "@/components/erp/tasks/TaskRow";
import { Skeleton, SkeletonCards, SkeletonList } from "@/components/erp/ui/Loading";
import TraineeBadge from "@/components/erp/ui/TraineeBadge";
import { EmptyState } from "@/components/erp/ui/DataTools";

// Risk levels: status colours always come with an icon and a label.
const LEVEL = {
  critical: { color: "#d03b3b", Icon: ShieldAlert },
  high: { color: "#ec835a", Icon: Flame },
  medium: { color: "#fab219", Icon: AlertTriangle },
  healthy: { color: "#0ca30c", Icon: CheckCircle2 },
};

function Section({ title, href, linkLabel, children, className = "" }) {
  return (
    <section className={`animate-fade-up rounded-2xl border border-white/10 bg-white/[0.03] p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        {href && (
          <Link href={href} className="flex items-center gap-1 text-xs text-white/50 hover:text-brand-orange">
            {linkLabel} <ArrowUpRight size={13} className="rtl:-scale-x-100" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function greeting(t) {
  const h = new Date().getHours();
  return t(h < 12 ? "erp.home.morning" : h < 18 ? "erp.home.afternoon" : "erp.home.evening");
}

function HomeSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonCards count={4} />
      <div className="grid gap-6 xl:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-white/[0.06] p-5">
            <Skeleton className="mb-5 h-4 w-40" />
            <SkeletonList rows={3} avatar={false} />
          </div>
        ))}
      </div>
    </div>
  );
}

// A customer's home: their projects (progress, stages, expected delivery) and the
// work waiting for their review.
const STAGE_TONE = {
  approved: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200",
  done: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200",
  skip: "border-white/10 text-white/60 line-through",
  cancelled: "border-white/10 text-white/60 line-through",
  pending: "border-amber-400/40 bg-amber-500/10 text-amber-200",
  in_progress: "border-sky-400/40 bg-sky-500/10 text-sky-200",
  on_hold: "border-sky-400/40 bg-sky-500/10 text-sky-200",
  help: "border-sky-400/40 bg-sky-500/10 text-sky-200",
};

function CustomerHome() {
  const { t, lang } = useLanguage();
  const [projects, setProjects] = useState(null);
  useEffect(() => {
    api("/api/customer/projects")
      .then((d) => setProjects(d.projects))
      .catch(() => setProjects([]));
  }, []);
  if (!projects) return <SkeletonList rows={3} avatar={false} />;
  const waiting = projects.reduce((n, p) => n + p.waitingForYou, 0);
  const dueNow = projects.flatMap((p) => (p.payments?.stages || []).filter((s) => s.status === "due").map((s) => ({ ...s, project: p.name?.[lang] || p.code })));
  return (
    <div className="space-y-4">
      {dueNow.map((s) => (
        <p key={`${s.project}-${s.n}`} className="animate-fade-up flex items-center gap-3 rounded-2xl border border-brand-orange/40 bg-brand-orange/10 p-4 text-sm font-medium">
          <Wallet size={18} className="text-brand-orange" />
          {t("erp.customer.dueNow", { n: s.n, project: s.project })}
        </p>
      ))}
      {waiting > 0 && (
        <Link
          href="/dashboard/reviews"
          className="animate-fade-up flex items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm hover:bg-amber-500/15"
        >
          <CheckCircle2 size={18} className="text-amber-300" />
          <span className="flex-1">{t("erp.customer.waiting", { n: waiting })}</span>
          <ArrowUpRight size={15} className="rtl:-scale-x-100" />
        </Link>
      )}
      <Section title={t("erp.customer.projects")}>
        <div className="space-y-4">
          {projects.map((p) => (
            <div key={p.id} className="rounded-xl border border-white/[0.06] p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="min-w-0 flex-1 font-semibold" dir="auto">
                  {p.name?.[lang]} {p.code && <span className="text-xs font-normal text-white/60">· {p.code}</span>}
                </span>
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs">{t(`erp.projects.status.${p.status}`)}</span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <span className="block h-2 flex-1 rounded-full bg-white/[0.06]">
                  <span className="block h-full rounded-full bg-[#3987e5]" style={{ width: `${p.progress}%` }} />
                </span>
                <span className="text-sm tabular-nums text-white/70">{p.progress}%</span>
              </div>
              <p className="mt-2 text-xs text-white/50">
                {[
                  p.startDate && `${t("erp.projects.startDate")}: ${formatDate(p.startDate, lang)}`,
                  p.dueDate && `${t("erp.projects.dueDate")}: ${formatDate(p.dueDate, lang)}`,
                  p.expectedEnd && `${t("erp.customer.expected")}: ${formatDate(p.expectedEnd, lang)}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.stages.map((s) => (
                  <span key={s.key} className={`rounded-full border px-2.5 py-0.5 text-[11px] ${STAGE_TONE[s.status] || "border-white/10 text-white/50"}`} title={t(`erp.customer.stage.${s.status}`)}>
                    {s.name?.[lang]}
                  </span>
                ))}
              </div>
              {p.milestones?.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold text-white/70">{t("erp.customer.milestones")}</p>
                  <ul className="space-y-1.5">
                    {p.milestones.map((ms) => (
                      <li key={ms.id} className="flex items-center gap-2 text-sm">
                        {ms.done ? <CheckCircle2 size={16} className="shrink-0 text-emerald-400" /> : <Circle size={16} className="shrink-0 text-white/30" />}
                        <span className={`flex-1 ${ms.done ? "text-white/90" : "text-white/70"}`} dir="auto">{ms.title}</span>
                        <span className={`text-[11px] ${ms.done ? "text-emerald-300" : "text-white/50"}`}>{t(ms.done ? "erp.customer.msDone" : "erp.customer.msOpen")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {p.payments && (
                <div className="mt-4 rounded-xl bg-white/[0.03] p-3">
                  <p className="mb-2 text-xs font-semibold text-white/70">{t("erp.customer.payments")}</p>
                  <div className="mb-3 grid grid-cols-3 gap-2 text-center text-xs">
                    {[["total", p.payments.total], ["paidSoFar", p.payments.paid], ["remaining", p.payments.remaining]].map(([k, v]) => (
                      <div key={k} className="rounded-lg bg-white/[0.04] p-2">
                        <p className="text-white/50">{t(`erp.customer.${k}`)}</p>
                        <p className="mt-0.5 font-semibold tabular-nums">{money(v, p.payments.currency || "USD", lang)}</p>
                      </div>
                    ))}
                  </div>
                  <ul className="space-y-1.5">
                    {p.payments.stages.map((s) => (
                      <li key={s.n} className="flex items-center gap-3 text-sm">
                        <span className="flex-1">
                          {t("erp.customer.payment", { n: s.n })}
                          {s.percent ? <span className="text-xs text-white/50"> · {s.percent}%</span> : null}
                        </span>
                        <span className="tabular-nums text-white/80">{money(s.amount, p.payments.currency || "USD", lang)}</span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] ${
                            s.status === "paid" ? "bg-emerald-500/15 text-emerald-300" : s.status === "due" ? "bg-brand-orange/20 text-brand-orange" : "bg-white/10 text-white/60"
                          }`}
                        >
                          {t(`erp.customer.pay.${s.status}`)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
          {!projects.length && <EmptyState compact text={t("erp.projects.none")} />}
        </div>
      </Section>
    </div>
  );
}

// "Needs you": every queue this person can act on, each linking to where they act.
function NeedsYou({ needs, persona }) {
  const { t } = useLanguage();
  if (!needs || persona === "employee") return null;
  if (!needs.length)
    return (
      <p className="animate-fade-up flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-200">
        <CheckCircle2 size={16} /> {t("erp.home.needs.none")}
      </p>
    );
  return (
    <div className="animate-fade-up rounded-2xl border border-brand-orange/25 bg-brand-orange/[0.06] p-3">
      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-brand-orange">{t("erp.home.needs.title")}</p>
      <div className="flex flex-wrap gap-2">
        {needs.map((n) => (
          <Link key={n.key} href={n.href} className="flex items-center gap-2 rounded-xl bg-white/[0.06] px-3 py-2 text-sm hover:bg-white/[0.12]">
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-orange px-1.5 text-xs font-bold text-white">{n.count}</span>
            {t(`erp.home.needs.${n.key}`)}
            <ArrowUpRight size={13} className="text-white/50 rtl:-scale-x-100" />
          </Link>
        ))}
      </div>
    </div>
  );
}

// The 4 headline numbers, chosen by the person's job (lib/homePersona.js).
function HeadlineTiles({ d, m }) {
  const { t } = useLanguage();
  const need = (k) => d.needs?.find((n) => n.key === k)?.count || 0;
  const personal = [
    <StatTile key="open" label={t("erp.home.openTasks")} value={d.myTasks?.open ?? 0} hint={d.myTasks?.submitted ? t("erp.home.waitingReview", { n: d.myTasks.submitted }) : ""} />,
    <StatTile key="overdue" label={t("erp.home.overdue")} value={d.myTasks?.overdue ?? 0} tone={d.myTasks?.overdue ? "text-red-300" : ""} />,
    <StatTile key="worked" label={t("erp.home.workedMonth")} value={d.myMonth ? hm(d.myMonth.worked) : "—"} hint={d.myMonth ? `${t("erp.hr.of")} ${hm(d.myMonth.required)}` : ""} />,
    <StatTile
      key="warn"
      label={t("erp.hr.warnings")}
      value={d.myMonth?.warnings ?? "—"}
      tone={d.myMonth?.warnings >= 4 ? "text-red-300" : ""}
      hint={d.myMonth?.efficiency != null ? `${t("erp.hr.efficiency")} ${Math.round(d.myMonth.efficiency * 100)}%` : ""}
    />,
  ];
  const tile = {
    present: d.team && <StatTile key="present" label={t("erp.home.present")} value={`${d.team.present}/${d.team.total}`} hint={d.team.onLeave ? `${t("erp.home.onLeave")}: ${d.team.onLeave}` : ""} />,
    reviews: d.reviews && <StatTile key="reviews" label={t("erp.nav.reviews")} value={d.reviews.count} tone={d.reviews.count ? "text-brand-orange" : ""} />,
    late: <StatTile key="late" label={t("erp.home.lateTasks")} value={need("lateTasks")} tone={need("lateTasks") ? "text-red-300" : ""} />,
    projects: d.projects && <StatTile key="projects" label={t("erp.home.activeProjects")} value={d.projects.active} hint={d.projects.atRisk ? t("erp.home.atRisk", { n: d.projects.atRisk }) : ""} />,
    atRisk: d.projects && <StatTile key="risk" label={t("erp.home.riskTile")} value={d.projects.atRisk} tone={d.projects.atRisk ? "text-[#ec835a]" : ""} />,
    net: d.finance && <StatTile key="net" label={t("erp.home.monthNet")} value={m(d.finance.monthNet)} tone={d.finance.monthNet < 0 ? "text-red-300" : "text-emerald-300"} />,
    receivables: d.finance && <StatTile key="recv" label={t("erp.finance.receivables")} value={m(d.finance.receivables)} tone="text-amber-300" />,
    leave: d.hr && <StatTile key="leave" label={t("erp.home.pendingLeave")} value={d.hr.pendingLeave} tone={d.hr.pendingLeave ? "text-brand-orange" : ""} />,
    intakes: d.office && <StatTile key="intakes" label={t("erp.home.openIntakes")} value={d.office.intakesNew} />,
    leads: d.office && d.office.leadsOpen !== null && <StatTile key="leads" label={t("erp.home.openLeads")} value={d.office.leadsOpen} hint={d.office.quotesSent ? t("erp.home.quotesSent", { n: d.office.quotesSent }) : ""} />,
  };
  const pick = {
    executive: ["net", "receivables", "projects", "present"],
    projects: ["projects", "atRisk", "late", "reviews"],
    department: ["present", "reviews", "late", "atRisk"],
    office: ["intakes", "leads", "present"],
    hr: ["present", "leave", "reviews"],
  }[d.persona];
  // Fill up to 4 with the person's own numbers.
  const chosen = (pick || []).map((k) => tile[k]).filter(Boolean);
  const list = [...chosen, ...personal].slice(0, 4);
  return <div className="animate-fade-up grid grid-cols-2 gap-3 md:grid-cols-4">{list}</div>;
}

// New accounts are sent to their profile until the name is filled in both languages.
function CompleteProfileNote({ user }) {
  const { t } = useLanguage();
  if (!user || namesComplete(user)) return null;
  return (
    <Link
      href="/dashboard/profile"
      className="flex items-center justify-between gap-3 rounded-2xl bg-brand-orange/10 px-5 py-4 text-sm text-brand-orange hover:bg-brand-orange/15"
    >
      {t("erp.names.completeProfile")}
      <ArrowUpRight size={16} className="shrink-0 rtl:-scale-x-100" />
    </Link>
  );
}

export default function DashboardOverview({ user }) {
  const { t, lang } = useLanguage();
  // The home screen seen before shows at once while the fresh one loads.
  const [data, setData] = useState(() => (user?.isStaff ? peekApi("/api/home") || null : null));

  const load = useCallback(() => {
    if (!user?.isStaff) return;
    api("/api/home")
      .then(setData)
      .catch(() => setData({}));
  }, [user?.isStaff]);
  useEffect(() => {
    load();
  }, [load]);
  usePollingFallback(load, 60000);
  useRealtimeEvent(userChannelName(user?.id), "task:updated", load);

  // Greeting and date depend on the viewer's clock, so they're filled in after mount
  // (the server renders in its own time zone).
  const [today, setToday] = useState(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday({ greeting: greeting(t), date: new Intl.DateTimeFormat(locale(lang), { weekday: "long", day: "numeric", month: "long" }).format(new Date()) });
  }, [t, lang]);

  const d = data || {};
  const m = (v) => money(v, d.finance?.base || "USD", lang);
  // Managers see their queues and the business first; their own tasks come after.
  const mine = d.persona && d.persona !== "employee" ? "order-last" : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="min-h-8 text-2xl font-bold">
          {today ? `${today.greeting}${lang === "ar" ? "، " : ", "}` : ""}
          {user?.name?.split(" ")[0] || user?.email}
        </h1>
        <p className="mt-1 text-sm text-white/50">
          {today ? `${today.date} · ` : ""}
          {user?.roleName?.[lang]}
        </p>
      </div>

      {user?.isCustomer && <CustomerHome />}

      {!user?.isStaff && !user?.isCustomer && (
        <div className="flex max-w-lg items-start gap-3 rounded-2xl border border-brand-orange/30 bg-brand-orange/10 p-5 text-sm text-white/80">
          <Clock size={20} className="mt-0.5 shrink-0 text-brand-orange" />
          {t("erp.pendingRole")}
        </div>
      )}

      {user?.isStaff && <CheckInCard />}

      {user?.isStaff && !data && <HomeSkeleton />}

      {data && (
        <>
          {d.pendingSignups > 0 && (
            <Link
              href="/dashboard/staff?filter=pending"
              className="animate-fade-up flex items-center gap-3 rounded-2xl border border-brand-orange/30 bg-brand-orange/10 p-4 text-sm hover:bg-brand-orange/15"
            >
              <UserPlus size={18} className="text-brand-orange" />
              <span className="flex-1">{t("erp.home.pendingSignups", { n: d.pendingSignups })}</span>
              <ArrowUpRight size={15} className="rtl:-scale-x-100" />
            </Link>
          )}

          <NeedsYou needs={d.needs} persona={d.persona} />

          <HeadlineTiles d={d} m={m} />

          <div className="grid gap-6 xl:grid-cols-2">
            <Section title={t("erp.home.myTasks")} href="/dashboard/tasks" linkLabel={t("erp.home.all")} className={mine}>
              <div className="space-y-2">
                {d.myTasks?.list.map((task) => (
                  <Link key={task.id} href={`/dashboard/tasks?task=${task.id}`} className="flex items-center gap-3 rounded-xl border border-white/[0.06] px-3 py-2.5 text-sm hover:bg-white/[0.05]">
                    <span className="w-12 shrink-0 text-xs text-white/60" dir="ltr">
                      #{task.number}
                    </span>
                    <span className="min-w-0 flex-1">
                      <TaskName task={task} compact />
                      {task.dueAt && (
                        <span className={`block text-xs ${task.late ? "text-red-300" : "text-white/60"}`}>{formatDateTime(task.dueAt, lang)}</span>
                      )}
                    </span>
                    <StatusBadge status={task.status} />
                  </Link>
                ))}
                {!d.myTasks?.list.length && <EmptyState compact text={t("erp.home.noTasks")} />}
              </div>
            </Section>

            <Section title={t("notifications.title")} href="/dashboard/notifications" linkLabel={t("erp.home.all")} className={mine}>
              <div className="space-y-2">
                {d.notifications?.map((n) => (
                  <Link key={n.id} href={n.link || "/dashboard/notifications"} className="flex items-start gap-3 rounded-xl px-2 py-2 text-sm hover:bg-white/[0.05]">
                    <Bell size={15} className={`mt-0.5 shrink-0 ${n.priority === "high" ? "text-brand-orange" : "text-white/60"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-white/85">{n.message?.[lang]}</span>
                      <span className="text-xs text-white/60">{formatRelative(n.createdAt, lang)}</span>
                    </span>
                  </Link>
                ))}
                {!d.notifications?.length && <p className="py-6 text-center text-sm text-white/60">{t("erp.home.allCaughtUp")}</p>}
              </div>
            </Section>

            {d.reviews && (
              <Section title={`${t("erp.nav.reviews")} (${d.reviews.count})`} href="/dashboard/reviews" linkLabel={t("erp.home.all")}>
                <div className="space-y-2">
                  {d.reviews.list.map((task) => (
                    <Link key={task.id} href={`/dashboard/reviews?task=${task.id}`} className="flex items-center gap-3 rounded-xl border border-white/[0.06] px-3 py-2.5 text-sm hover:bg-white/[0.05]">
                      <span className="min-w-0 flex-1">
                        <TaskName task={task} compact />
                        <span className="block text-xs text-white/60">
                          {task.assignee?.name} {task.assignee && <TraineeBadge id={task.assignee.id} />} · {formatRelative(task.submittedAt, lang)}
                        </span>
                      </span>
                      {task.late && <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] text-red-300">{t("erp.tasks.late")}</span>}
                    </Link>
                  ))}
                  {!d.reviews.list.length && <p className="py-6 text-center text-sm text-white/60">{t("erp.home.nothingToReview")}</p>}
                </div>
              </Section>
            )}

            {d.projects && (
              <Section title={t("erp.home.projects", { n: d.projects.active })} href="/dashboard/analytics" linkLabel={t("erp.nav.analytics")}>
                {d.projects.atRisk > 0 && (
                  <p className="mb-3 flex items-center gap-2 text-sm text-[#ec835a]">
                    <Flame size={15} /> {t("erp.home.atRisk", { n: d.projects.atRisk })}
                  </p>
                )}
                <div className="space-y-2">
                  {d.projects.top.map((p) => {
                    const L = LEVEL[p.level];
                    return (
                      <Link key={p.id} href={`/dashboard/projects/${p.id}`} className="flex items-center gap-3 rounded-xl border border-white/[0.06] px-3 py-2.5 text-sm hover:bg-white/[0.05]">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{p.name?.[lang]}</span>
                          <span className="mt-1 block h-1.5 w-full max-w-48 rounded-full bg-white/[0.06]">
                            <span className="block h-full rounded-full bg-[#3987e5]" style={{ width: `${p.progress}%` }} />
                          </span>
                        </span>
                        <span className="text-xs tabular-nums text-white/50">{p.progress}%</span>
                        <span className="flex items-center gap-1 text-xs" style={{ color: L.color }}>
                          <L.Icon size={14} />
                          <span className="text-white/80">{t(`erp.analytics.level.${p.level}`)}</span>
                        </span>
                      </Link>
                    );
                  })}
                  {!d.projects.top.length && <EmptyState compact text={t("erp.projects.none")} />}
                </div>
              </Section>
            )}

            {d.team && (
              <Section title={t("erp.home.teamToday")} href="/dashboard/analytics" linkLabel={t("erp.home.board")}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatTile label={t("erp.home.present")} value={`${d.team.present}/${d.team.total}`} />
                  <StatTile label={t("erp.home.workingNow")} value={d.team.working} />
                  <StatTile label={t("erp.home.onLeave")} value={d.team.onLeave} />
                  <StatTile label={t("erp.home.notIn")} value={Math.max(0, d.team.total - d.team.present - d.team.onLeave)} />
                </div>
              </Section>
            )}

            {d.hr && (
              <Section title={t("erp.nav.hr")} href="/dashboard/hr" linkLabel={t("erp.home.open")}>
                <div className="space-y-3 text-sm">
                  <Link href="/dashboard/hr?tab=leave" className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2.5 hover:bg-white/10">
                    <span className="flex items-center gap-2">
                      <CalendarClock size={15} className="text-white/50" /> {t("erp.home.pendingLeave")}
                    </span>
                    <span className={`font-semibold tabular-nums ${d.hr.pendingLeave ? "text-brand-orange" : "text-white/50"}`}>{d.hr.pendingLeave}</span>
                  </Link>
                  {d.hr.contractsEnding.map((c) => (
                    <Link key={c.id} href={`/dashboard/staff?person=${c.id}`} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2.5 hover:bg-white/10">
                      <span>{t("erp.home.contractEnds", { name: c.name })}</span>
                      <span className="text-xs text-amber-300">{formatDate(c.date, lang)}</span>
                    </Link>
                  ))}
                  {d.hr.devicesOffline.map((name) => (
                    <p key={name} className="flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2.5 text-red-300">
                      <WifiOff size={15} /> {t("erp.home.deviceOffline", { name })}
                    </p>
                  ))}
                </div>
              </Section>
            )}

            {d.finance && (
              <Section title={t("erp.nav.finance")} href="/dashboard/finance" linkLabel={t("erp.home.open")}>
                <div className="grid gap-3 sm:grid-cols-2">
                  {d.finance.funds.map((f) => (
                    <div key={f.name?.en} className="rounded-xl bg-white/5 p-3">
                      <p className="text-xs text-white/50">{t("erp.finance.fundOf", { name: f.name?.[lang] })}</p>
                      <p className={`mt-1 text-xl font-bold tabular-nums ${f.balance < 0 ? "text-red-300" : ""}`}>{m(f.balance)}</p>
                      {f.inTransit > 0 && (
                        <p className="text-xs text-amber-300">
                          {t("erp.finance.inTransit")}: {m(f.inTransit)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-white/50">{t("erp.finance.receivables")}</p>
                    <p className="font-semibold tabular-nums text-amber-300">{m(d.finance.receivables)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/50">{t("erp.home.monthNet")}</p>
                    <p className={`font-semibold tabular-nums ${d.finance.monthNet < 0 ? "text-red-300" : "text-emerald-300"}`}>{m(d.finance.monthNet)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/50">{t("erp.finance.netProfit")}</p>
                    <p className={`font-semibold tabular-nums ${d.finance.netYear < 0 ? "text-red-300" : ""}`}>{m(d.finance.netYear)}</p>
                  </div>
                </div>
                {d.finance.overBudget > 0 && (
                  <p className="mt-3 flex items-center gap-2 text-sm text-red-300">
                    <AlertTriangle size={15} /> {t("erp.home.overBudget", { n: d.finance.overBudget })}
                  </p>
                )}
              </Section>
            )}
          </div>
        </>
      )}

      <CompleteProfileNote user={user} />
    </div>
  );
}
