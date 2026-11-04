"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarDays, ChartNoAxesGantt, LayoutGrid, LayoutTemplate, ListChecks, Plus } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { formatDate } from "@/lib/formatTime";
import { canSeeGantt } from "@/lib/gantt";
import Modal from "@/components/erp/ui/Modal";
import { Button, PageHeader, Select } from "@/components/erp/ui/fields";
import ProjectForm from "@/components/erp/projects/ProjectForm";
import { canRouteStages } from "@/components/erp/projects/StageRouting";
import ProjectsTimeline from "@/components/erp/projects/ProjectsTimeline";
import ProjectsSummary from "@/components/erp/projects/ProjectsSummary";
import { useTaskLookups } from "@/components/erp/tasks/useTaskLookups";
import { SkeletonList } from "@/components/erp/ui/Loading";

const STATUSES = ["active", "on_hold", "finished", "archived"];

export default function ProjectsList() {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();
  const lookups = useTaskLookups();
  const [status, setStatus] = useState("active");
  const [department, setDepartment] = useState("");
  // The Gantt timeline is the GM / CEO's; everyone else gets the project cards.
  const gantt = canSeeGantt(user);
  const [picked, setView] = useState("timeline");
  const view = gantt ? picked : "cards";
  const canManage = user?.permissions?.includes("projects.manage");
  const isDeptManager = user?.scope === "department" && user?.permissions?.includes("tasks.review");

  const visible = useMemo(
    () => lookups.projects.filter((p) => (!status || p.status === status) && (!department || p.department === department)),
    [lookups.projects, status, department]
  );

  return (
    <div>
      <PageHeader
        title={t("erp.nav.projects")}
        subtitle={t("erp.projects.subtitle")}
        actions={
          canManage && (
            <>
              <Link href="/dashboard/projects/templates">
                <Button variant="ghost">
                  <LayoutTemplate size={16} /> {t("erp.projects.templates")}
                </Button>
              </Link>
              {/* Every project starts from an intake form; the CEO accepts it there. */}
              {(canRouteStages(user) || isDeptManager) && (
                <Link href="/dashboard/intake">
                  <Button>
                    <Plus size={16} /> {t("erp.projects.new")}
                  </Button>
                </Link>
              )}
            </>
          )
        }
      />

      <div className="mb-6 flex flex-wrap gap-3">
        {gantt && (
        <div className="flex gap-1 rounded-xl border border-white/10 p-1">
          {[
            ["timeline", ChartNoAxesGantt],
            ["cards", LayoutGrid],
          ].map(([v, Icon]) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${view === v ? "bg-white/15 text-white" : "text-white/60 hover:text-white"}`}
            >
              <Icon size={15} /> {t(`erp.gantt.${v}`)}
            </button>
          ))}
        </div>
        )}
        <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 p-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-lg px-3 py-1.5 text-sm ${status === s ? "bg-brand-orange text-white" : "text-white/60 hover:text-white"}`}
            >
              {t(`erp.projects.status.${s}`)}
            </button>
          ))}
        </div>
        {lookups.departments.length > 1 && (
          <div className="w-56">
            <Select
              value={department}
              onChange={setDepartment}
              placeholder={t("erp.projects.allDepartments")}
              options={lookups.departments.map((d) => ({ value: d.id, label: d.name?.[lang] }))}
            />
          </div>
        )}
      </div>

      {view === "timeline" && lookups.projectsLoaded && <ProjectsTimeline projects={visible} status={status} />}

      <div className={`grid gap-4 md:grid-cols-2 xl:grid-cols-3 ${view === "cards" ? "" : "hidden"}`}>
        {visible.map((p) => {
          const dep = lookups.departments.find((d) => d.id === p.department);
          const pct = Math.round((p.progress || 0) * 100);
          return (
            <Link
              key={p.id}
              href={`/dashboard/projects/${p.id}`}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{p.name?.[lang]}</p>
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-white/45">
                    {dep && <span className="h-2 w-2 rounded-full" style={{ background: dep.color }} />}
                    {[p.code, dep?.name?.[lang], p.client].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {p.late && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-1 text-xs text-red-300">
                    <AlertTriangle size={12} /> {t("erp.tasks.late")}
                  </span>
                )}
              </div>

              <div className="mt-5">
                <div className="mb-1.5 flex justify-between text-xs text-white/55">
                  <span>{t("erp.projects.progress")}</span>
                  <span dir="ltr">{pct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-brand-orange transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/55">
                <span className="flex items-center gap-1">
                  {/* The delivery the Gantt expects now. */}
                  <CalendarDays size={13} /> {formatDate(p.forecastEnd || p.dueDate, lang)}
                </span>
                <span className="flex items-center gap-1">
                  <ListChecks size={13} /> {t("erp.projects.openTasks", { count: p.openTasks })}
                </span>
                {p.overdueTasks > 0 && (
                  <span className="text-red-300">{t("erp.projects.overdueTasks", { count: p.overdueTasks })}</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
      {!lookups.projectsLoaded && <SkeletonList rows={5} />}
      {lookups.projectsLoaded && visible.length === 0 && <p className="py-12 text-center text-white/40">{t("erp.projects.none")}</p>}

      <ProjectsSummary />

    </div>
  );
}
