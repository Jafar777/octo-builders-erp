"use client";

import { AlertTriangle, Clock, Timer } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { formatDateTime } from "@/lib/formatTime";
import Avatar from "@/components/erp/ui/Avatar";
import { formatDuration, liveActiveMs, PRIORITY_STYLE, revisionLabel, STATUS_STYLE } from "@/components/erp/tasks/taskUi";
import { PlanningBadges } from "@/components/erp/tasks/TaskPlanning";
import Stars from "@/components/erp/tasks/Stars";
import TraineeBadge from "@/components/erp/ui/TraineeBadge";

export function StatusBadge({ status }) {
  const { t } = useLanguage();
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs ${STATUS_STYLE[status] || ""}`}>
      {t(`erp.tasks.status.${status}`)}
    </span>
  );
}

export function taskHeading(task, lang) {
  if (task.title && !task.stage) return task.title;
  return [task.title, task.stage?.name?.[lang]].filter(Boolean).join(" · ") || "—";
}

// How a task is named across the dashboard (not the Gantt): the project's name on top
// and bigger, the task's name under it and smaller. A task with no project shows its own
// name in the big line. `compact` for small cards (home page, team cards).
export function TaskName({ task, compact = false, number = false, extra = null }) {
  const { lang } = useLanguage();
  const projectName = task?.project?.name?.[lang];
  const heading = task ? taskHeading(task, lang) : "—";
  const num = number && task?.number ? (
    <span className="me-1.5 text-xs font-normal text-white/60" dir="ltr">
      #{task.number}
    </span>
  ) : null;
  if (!projectName) {
    return (
      <span className={`block truncate ${compact ? "text-sm font-semibold" : "font-semibold"} text-white`} title={heading} dir="auto">
        {num}
        {heading}
        {extra}
      </span>
    );
  }
  return (
    <span className="block min-w-0">
      <span className={`block truncate font-bold text-white ${compact ? "text-sm" : "text-base"}`} title={projectName} dir="auto">
        {num}
        {projectName}
      </span>
      <span className={`block truncate text-white/75 ${compact ? "text-xs" : "text-sm"}`} title={heading} dir="auto">
        {heading}
        {extra}
      </span>
    </span>
  );
}

// The project's name on top, bigger than the task's (`projectFirst={false}` inside a
// project's own page, where every task belongs to that project).
export default function TaskRow({ task, lookups, now, onOpen, showAssignee = false, projectFirst = true }) {
  const { t, lang } = useLanguage();
  const running = task.status === "in_progress";
  const projectName = task.project?.name?.[lang];
  const onTop = projectFirst && projectName;

  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-start transition-colors hover:bg-white/[0.06]"
    >
      <span className="w-14 shrink-0 text-xs text-white/60" dir="ltr">
        #{task.number}
      </span>
      <span className="min-w-0 flex-1 basis-64">
        {onTop && <span className="mb-0.5 block truncate text-base font-bold text-white">{projectName}</span>}
        <span className="flex flex-wrap items-center gap-2">
          <span className={`truncate ${onTop ? "text-sm text-white/80" : "font-medium"}`}>{taskHeading(task, lang)}</span>
          {task.kind !== "task" && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/70">{t(`erp.tasks.kind.${task.kind}`)}</span>
          )}
          {(task.kind === "task" || task.kind === "revision") && task.stage && task.revision > 0 && (
            <span className="text-[11px] text-white/60" dir="ltr">
              {revisionLabel(task.revision)}
            </span>
          )}
          {task.maxHours > 0 && (
            <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] text-sky-200" title={t("erp.scale.maxAllowed")}>
              {t("erp.scale.hours", { h: task.maxHours })}
            </span>
          )}
          {task.priority !== "normal" && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${PRIORITY_STYLE[task.priority]}`}>
              {t(`erp.tasks.priority.${task.priority}`)}
            </span>
          )}
          <PlanningBadges task={task} />
        </span>
        <span className="mt-0.5 block truncate text-xs text-white/60">
          {[!onTop && projectName, lookups.typeName(task.type)].filter(Boolean).join(" · ")}
        </span>
      </span>

      {showAssignee && task.assignee && (
        <span className="flex items-center gap-2 text-xs text-white/70">
          <Avatar name={task.assignee.name} src={task.assignee.avatarUrl} size={24} />
          {task.assignee.name}
          <TraineeBadge id={task.assignee.id} />
        </span>
      )}

      {task.dueAt && (
        <span className={`flex items-center gap-1 text-xs ${task.late ? "text-red-300" : "text-white/50"}`}>
          {task.late ? <AlertTriangle size={13} /> : <Clock size={13} />}
          {formatDateTime(task.dueAt, lang)}
        </span>
      )}

      {(task.activeMs > 0 || running) && (
        <span className={`flex items-center gap-1 text-xs ${running ? "text-sky-300" : "text-white/50"}`} dir="ltr">
          <Timer size={13} />
          {formatDuration(liveActiveMs(task, now))}
        </span>
      )}

      {task.stars > 0 && <Stars value={task.stars} size={13} />}

      <StatusBadge status={task.status} />
    </button>
  );
}
