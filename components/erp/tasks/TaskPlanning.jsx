"use client";

import { useEffect, useState } from "react";
import { Link2, ListTree, Lock, Repeat, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api } from "@/lib/clientApi";
import { Input, Label, Select } from "@/components/erp/ui/fields";
import { StatusBadge, taskHeading } from "@/components/erp/tasks/TaskRow";

// Picks the tasks this one waits for. Candidates = open tasks of the same project
// (or my own tasks when there's no project).
export function DependencyPicker({ value, onChange, projectId, excludeId }) {
  const { t, lang } = useLanguage();
  const [candidates, setCandidates] = useState([]);

  useEffect(() => {
    const url = projectId ? `/api/tasks?view=project&project=${projectId}` : "/api/tasks?view=mine";
    api(url)
      .then((d) => setCandidates(d.tasks.filter((x) => x.id !== excludeId && x.status !== "cancelled")))
      .catch(() => setCandidates([]));
  }, [projectId, excludeId]);

  const chosen = value.map((id) => candidates.find((c) => c.id === id) || { id, number: "…" });
  const options = candidates
    .filter((c) => !value.includes(c.id))
    .map((c) => ({ value: c.id, label: `#${c.number} · ${taskHeading(c, lang)}${c.assignee ? ` — ${c.assignee.name}` : ""}` }));

  return (
    <div>
      <Label>{t("erp.tasks.dependsOn")}</Label>
      {chosen.length > 0 && (
        // Each task waited for, by name: "#81 · <task name>", its engineer and its state.
        <div className="mb-2 space-y-1.5">
          {chosen.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
              <Link2 size={14} className="shrink-0 text-white/60" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="shrink-0 text-xs text-white/60" dir="ltr">
                    #{c.number}
                  </span>
                  <span className="truncate font-medium text-white">{c.status ? taskHeading(c, lang) : "…"}</span>
                </span>
                {c.assignee && <span className="block truncate text-xs text-white/60">{c.assignee.name}</span>}
              </span>
              {c.status && <StatusBadge status={c.status} />}
              <button type="button" onClick={() => onChange(value.filter((id) => id !== c.id))} className="shrink-0 rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white" aria-label={t("common.delete")}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <Select value="" onChange={(id) => id && onChange([...value, id])} placeholder={t("erp.tasks.addDependency")} options={options} />
    </div>
  );
}

// Repeat rule fields: { freq, interval, until }.
export function RecurrenceFields({ value, onChange }) {
  const { t } = useLanguage();
  const set = (field) => (v) => onChange({ ...value, [field]: v });
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Select
        label={t("erp.tasks.repeat")}
        value={value.freq}
        onChange={set("freq")}
        options={["", "daily", "weekly", "monthly"].map((f) => ({ value: f, label: t(`erp.tasks.freq.${f || "none"}`) }))}
      />
      {value.freq && (
        <>
          <Input type="number" min="1" max="12" label={t("erp.tasks.every")} value={value.interval} onChange={set("interval")} dir="ltr" />
          <Input type="date" label={`${t("erp.tasks.repeatUntil")} ${t("dashboard.optional")}`} value={value.until} onChange={set("until")} />
        </>
      )}
    </div>
  );
}

export function recurrenceText(t, r, formatDate) {
  if (!r) return "";
  const every = r.interval > 1 ? t("erp.tasks.everyN", { n: r.interval, unit: t(`erp.tasks.unit.${r.freq}`) }) : t(`erp.tasks.freq.${r.freq}`);
  return [every, r.until ? t("erp.tasks.untilDate", { date: formatDate(r.until) }) : "", r.nextAt ? t("erp.tasks.nextOn", { date: formatDate(r.nextAt) }) : ""]
    .filter(Boolean)
    .join(" · ");
}

// Small icons for task lists: waiting, repeating, sub-task progress.
export function PlanningBadges({ task }) {
  const { t } = useLanguage();
  return (
    <>
      {task.blocked && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300" title={t("erp.tasks.blocked")}>
          <Lock size={11} /> {t("erp.tasks.waiting")}
        </span>
      )}
      {(task.recurrence || task.recurrenceOf) && (
        <span className="text-white/60" title={t("erp.tasks.repeating")}>
          <Repeat size={13} />
        </span>
      )}
      {task.subtasks?.total > 0 && (
        <span className="inline-flex items-center gap-1 text-[11px] text-white/55" title={t("erp.tasks.subtasks")} dir="ltr">
          <ListTree size={13} /> {task.subtasks.done}/{task.subtasks.total}
        </span>
      )}
      {task.parentTask && (
        <span className="inline-flex items-center gap-1 text-[11px] text-white/60" dir="ltr">
          <Link2 size={12} /> #{task.parentTask.number}
        </span>
      )}
    </>
  );
}
