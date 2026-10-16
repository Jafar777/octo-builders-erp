"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowDown, ArrowUp, CalendarDays, ExternalLink, Lock, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import ProjectScore from "@/components/erp/projects/ProjectScore";
import { usePollingFallback, useRealtimeEvent } from "@/context/RealtimeContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDate } from "@/lib/formatTime";
import BilingualField from "@/components/dashboard/BilingualField";
import Modal from "@/components/erp/ui/Modal";
import { Button, Card, ErrorText, Input, Label, Select } from "@/components/erp/ui/fields";
import TaskRow, { StatusBadge } from "@/components/erp/tasks/TaskRow";
import TaskForm from "@/components/erp/tasks/TaskForm";
import TaskDrawer from "@/components/erp/tasks/TaskDrawer";
import { useTaskLookups } from "@/components/erp/tasks/useTaskLookups";
import { revisionLabel, STATUS_STYLE, toDateInput, useNow } from "@/components/erp/tasks/taskUi";
import { PageSkeleton } from "@/components/erp/ui/Loading";
import StageRouting, { canRouteStages, FlowBadge, FlowSelect } from "@/components/erp/projects/StageRouting";
import ScaleSelect, { ScaleBadge } from "@/components/erp/projects/ScaleSelect";

const TABS = ["board", "tasks", "settings"];

function CellModal({ project, cell, canManage, lookups, onOpenTask, onNewTask, onChanged, onClose }) {
  const { t, lang } = useLanguage();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const stage = project.stages.find((s) => s.key === cell.stage);
  const state = project.cells[cell.stage];
  const locked = project.locked?.includes(cell.stage);
  const assignee = lookups.people.find((p) => p.id === state?.assignee);

  async function override(status) {
    setError("");
    try {
      await api(`/api/work-projects/${project.id}/override`, {
        method: "POST",
        body: { stage: cell.stage, status, reason },
      });
      onChanged();
      onClose();
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-white/60">
        {project.name?.[lang]} · {stage?.name?.[lang]}
        {state?.count > 1 && <span className="ms-2 text-white/40">({t("erp.projects.stageTasks", { count: state.count })})</span>}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={state?.status === "pending" ? "submitted" : state?.status || "not_started"} />
        {state?.revision !== null && state?.revision !== undefined && (
          <span className="text-xs text-white/50" dir="ltr">
            #{state.number} · {revisionLabel(state.revision)}
          </span>
        )}
        {assignee && <span className="text-xs text-white/60">{assignee.name}</span>}
      </div>
      {state?.override && (
        <p className="rounded-xl bg-white/5 px-3 py-2 text-sm text-white/70">
          {t(`erp.tasks.status.${state.override.status}`)} — {state.override.reason}
        </p>
      )}

      {locked && (
        <p className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm text-white/60">
          <Lock size={14} /> {t("erp.projects.waitingNote")}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {state?.taskId && (
          <Button variant="ghost" onClick={() => onOpenTask(state.taskId)}>
            {t("erp.projects.openTask")}
          </Button>
        )}
        {project.status === "active" && !locked && (
          <Button onClick={onNewTask}>
            <Plus size={16} /> {state?.taskId ? t("erp.projects.newRevision") : t("erp.tasks.new")}
          </Button>
        )}
      </div>

      {canManage && (
        <div className="space-y-3 border-t border-white/10 pt-4">
          <p className="text-sm font-medium text-white/70">{t("erp.projects.manualState")}</p>
          <Input label={t("erp.projects.reason")} value={reason} onChange={setReason} />
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => override("skip")} disabled={!reason.trim()}>
              {t("erp.tasks.status.skip")}
            </Button>
            <Button variant="ghost" onClick={() => override("done")} disabled={!reason.trim()}>
              {t("erp.projects.markDone")}
            </Button>
            {state?.override && (
              <Button variant="danger" onClick={() => override("clear")}>
                {t("erp.projects.clearOverride")}
              </Button>
            )}
          </div>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

function ProjectSettings({ project, lookups, onSaved }) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const canRoute = canRouteStages(user);
  const [form, setForm] = useState({
    name: project.name,
    code: project.code,
    client: project.client,
    status: project.status,
    priority: project.priority,
    scale: project.scale || "",
    flow: project.flow || "mixed",
    startDate: toDateInput(project.startDate),
    dueDate: toDateInput(project.dueDate),
    folderLink: project.folderLink,
    participants: project.participants,
  });
  const [stages, setStages] = useState(project.stages);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));

  async function save(extra = {}) {
    setError("");
    setStatus("");
    try {
      await api(`/api/work-projects/${project.id}`, {
        method: "PATCH",
        body: { ...form, stages, ...extra },
      });
      setStatus(t("common.saved"));
      onSaved();
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  async function saveAsTemplate() {
    const name = window.prompt(t("erp.projects.templateName"), project.name.en);
    if (!name) return;
    try {
      await api("/api/project-templates", {
        method: "POST",
        body: { name: { ar: project.name.ar, en: name }, fromProjectId: project.id },
      });
      setStatus(t("erp.projects.templateSaved"));
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  const move = (list, i, to) => {
    if (to < 0 || to >= list.length) return list;
    const next = [...list];
    const [x] = next.splice(i, 1);
    next.splice(to, 0, x);
    return next;
  };

  return (
    <div className="max-w-4xl space-y-6">
      <Card className="space-y-4">
        <BilingualField label={t("erp.projects.name")} value={form.name} onChange={set("name")} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label={t("erp.projects.code")} value={form.code} onChange={set("code")} dir="ltr" />
          <Input label={t("erp.projects.client")} value={form.client} onChange={set("client")} />
          <Select
            label={t("erp.projects.statusLabel")}
            value={form.status}
            onChange={set("status")}
            options={["active", "on_hold", "finished", "archived"].map((s) => ({ value: s, label: t(`erp.projects.status.${s}`) }))}
          />
          <Input type="date" label={t("erp.projects.startDate")} value={form.startDate} onChange={set("startDate")} />
          <Input type="date" label={t("erp.projects.dueDate")} value={form.dueDate} onChange={set("dueDate")} />
          <Select
            label={t("erp.tasks.priorityLabel")}
            value={form.priority}
            onChange={set("priority")}
            options={["normal", "important", "urgent"].map((p) => ({ value: p, label: t(`erp.tasks.priority.${p}`) }))}
          />
        </div>
        <Input label={t("erp.projects.folderLink")} value={form.folderLink} onChange={set("folderLink")} dir="ltr" />
        <ScaleSelect scales={lookups.settings.projectScales} value={form.scale} onChange={set("scale")} />
        <FlowSelect value={form.flow} onChange={set("flow")} />
        <div>
          <Label>{t("erp.projects.participants")}</Label>
          <div className="flex flex-wrap gap-1.5">
            {lookups.people.map((p) => {
              const on = form.participants.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    set("participants")(on ? form.participants.filter((x) => x !== p.id) : [...form.participants, p.id])
                  }
                  className={`rounded-full border px-3 py-1 text-xs ${on ? "border-brand-orange bg-brand-orange/20 text-white" : "border-white/10 text-white/60"}`}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      <Card className="space-y-3">
        <p className="font-semibold">{t("erp.projects.stages")}</p>
        {canRoute && <p className="text-xs text-white/45">{t("erp.projects.routingHint")}</p>}
        {stages.map((stage, i) => (
          <div key={i} className="grid items-end gap-2 rounded-xl border border-white/10 p-3 sm:grid-cols-[1fr_180px_auto]">
            <BilingualField
              label={`${t("erp.projects.stage")} ${i + 1}`}
              value={stage.name}
              onChange={(name) => setStages((l) => l.map((x, j) => (j === i ? { ...x, name } : x)))}
            />
            <Select
              label={t("erp.tasks.type")}
              value={stage.taskType}
              onChange={(taskType) => setStages((l) => l.map((x, j) => (j === i ? { ...x, taskType } : x)))}
              options={lookups.settings.taskTypes.map((tt) => ({ value: tt.key, label: tt.name?.[lang] }))}
            />
            <div className="flex">
              <button type="button" onClick={() => setStages((l) => move(l, i, i - 1))} className="p-1.5 text-white/50 hover:text-white">
                <ArrowUp size={14} />
              </button>
              <button type="button" onClick={() => setStages((l) => move(l, i, i + 1))} className="p-1.5 text-white/50 hover:text-white">
                <ArrowDown size={14} />
              </button>
              <button type="button" onClick={() => setStages((l) => l.filter((_, j) => j !== i))} className="p-1.5 text-red-400">
                <Trash2 size={14} />
              </button>
            </div>
            {(canRoute || form.flow === "mixed") && (
              <div className="sm:col-span-3">
                <StageRouting
                  stage={stage}
                  index={i}
                  departments={lookups.departments}
                  canRoute={canRoute}
                  flow={form.flow}
                  onChange={(patch) => setStages((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)))}
                />
              </div>
            )}
          </div>
        ))}
        <Button variant="ghost" onClick={() => setStages((l) => [...l, { key: "", name: { ar: "", en: "" }, taskType: "other" }])}>
          <Plus size={16} /> {t("erp.projects.addStage")}
        </Button>
      </Card>

      <ErrorText>{error}</ErrorText>
      {status && <p className="text-sm text-emerald-300">{status}</p>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => save()}>{t("common.save")}</Button>
        <Button variant="ghost" onClick={() => save({ freezeBaseline: true })}>
          {t("erp.projects.freezeBaseline")}
        </Button>
        <Button variant="ghost" onClick={saveAsTemplate}>
          {t("erp.projects.saveAsTemplate")}
        </Button>
      </div>
    </div>
  );
}

export default function ProjectBoard({ projectId }) {
  const { t, lang } = useLanguage();
  const lookups = useTaskLookups();
  const [data, setData] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [tab, setTab] = useState("board");
  const [cell, setCell] = useState(null);
  const [newTaskFor, setNewTaskFor] = useState(null);
  const [openTaskId, setOpenTaskId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [p, list] = await Promise.all([
        api(`/api/work-projects/${projectId}`),
        api(`/api/tasks?view=project&project=${projectId}`),
      ]);
      setData(p);
      setTasks(list.tasks);
    } catch (err) {
      setError(errorText(t, err));
    }
  }, [projectId, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  usePollingFallback(load, 20000);

  // Every department working on the project hears its updates here.
  const projectChannel = data ? `private-project-${projectId}` : null;
  useRealtimeEvent(projectChannel, "task:updated", (e) => e.projectId === projectId && load());
  useRealtimeEvent(projectChannel, "project:updated", (e) => e.id === projectId && load());

  const now = useNow(tasks.some((x) => x.status === "in_progress"));
  const project = data?.project;
  const canManage = data?.access === "manage";
  const { user } = useAuth();
  // Managers of the department doing a stage handle its cells too.
  const canManageStage = (stage) =>
    canManage ||
    Boolean(user?.permissions?.includes("projects.manage") && user?.department && (stage?.department || project?.department) === user.department);
  const sortedTasks = useMemo(() => [...tasks].sort((a, b) => b.number - a.number), [tasks]);

  if (!project) {
    return error ? <ErrorText>{error}</ErrorText> : <PageSkeleton tiles={0} tabs={3} />;
  }

  const pct = Math.round((project.progress || 0) * 100);
  const dep = lookups.departments.find((d) => d.id === project.department);

  return (
    <div>
      <Link href="/dashboard/projects" className="mb-4 inline-flex items-center gap-2 text-sm text-white/55 hover:text-white">
        <ArrowLeft size={15} className="rtl:rotate-180" /> {t("erp.nav.projects")}
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{project.name?.[lang]}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/50">
            {[project.code, dep?.name?.[lang], project.client].filter(Boolean).join(" · ")}
            <span className="flex items-center gap-1">
              <CalendarDays size={14} /> {formatDate(project.dueDate, lang)}
            </span>
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs">{t(`erp.projects.status.${project.status}`)}</span>
            <ScaleBadge scales={lookups.settings.projectScales} value={project.scale} />
            <FlowBadge flow={project.flow} />
            {project.folderLink && (
              <a href={project.folderLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-brand-orange hover:underline">
                {t("erp.projects.folder")} <ExternalLink size={13} />
              </a>
            )}
          </p>
        </div>
        <div className="w-64">
          <div className="mb-1.5 flex justify-between text-xs text-white/55">
            <span>
              {t("erp.projects.progress")} ({project.complete}/{project.total})
            </span>
            <span dir="ltr">{pct}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-brand-orange" style={{ width: `${pct}%` }} />
          </div>
          {project.kpi?.score !== null && project.kpi?.score !== undefined && (
            <p className="mt-2 flex justify-between text-xs text-white/55">
              <span>{t("erp.analytics.col.score")}</span>
              <ProjectScore kpi={project.kpi} />
            </p>
          )}
        </div>
      </div>

      <div className="relative mb-6 flex gap-1 border-b border-white/10">
        {TABS.filter((x) => x !== "settings" || canManage).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className="relative px-4 py-3 text-sm font-medium text-white/60 data-[active=true]:text-white"
            data-active={tab === key}
          >
            {t(`erp.projects.tab.${key}`)}
            {tab === key && <motion.span layoutId="project-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-orange" />}
          </button>
        ))}
      </div>

      {tab === "board" && (
        <div className="overflow-x-auto rounded-2xl border border-white/10 p-3">
          <div className="grid min-w-[640px] gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(project.stages.length, 1)}, minmax(110px, 1fr))` }}>
            {project.stages.map((s) => {
              const c = project.cells[s.key] || { status: "not_started" };
              const person = lookups.people.find((p) => p.id === c.assignee);
              const waiting = c.status === "not_started" && project.locked?.includes(s.key);
              return (
                <div key={s.key} className="flex flex-col gap-1.5">
                  <p className="flex min-h-9 flex-col items-center justify-end text-center text-xs font-medium text-white/60">
                    <span className="inline-flex items-center gap-1">
                      {project.locked?.includes(s.key) && <Lock size={11} className="text-white/40" />}
                      {s.name?.[lang]}
                    </span>
                    {s.department && s.department !== project.department && (
                      <span className="block text-[10px] font-normal text-brand-orange">{lookups.departmentName(s.department)}</span>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => setCell({ stage: s.key })}
                    className={`flex h-16 w-full flex-col items-center justify-center rounded-xl border px-1 text-[11px] leading-tight transition hover:brightness-125 ${STATUS_STYLE[c.status] || STATUS_STYLE.not_started}`}
                  >
                    <span className="text-xs font-medium">{waiting ? t("erp.projects.waiting") : t(`erp.tasks.status.${c.status}`)}</span>
                    {c.number && (
                      <span className="opacity-70" dir="ltr">
                        #{c.number}
                        {c.revision > 0 ? ` · ${revisionLabel(c.revision)}` : ""}
                        {person ? ` · ${person.name.split(" ")[0]}` : ""}
                      </span>
                    )}
                    {c.count > 1 && <span className="opacity-60">{t("erp.projects.stageTasks", { count: c.count })}</span>}
                  </button>
                </div>
              );
            })}
          </div>
          {project.stages.length === 0 && (
            <p className="px-4 py-10 text-center text-white/40">{canManage ? t("erp.projects.noStagesManage") : t("erp.projects.noStages")}</p>
          )}
        </div>
      )}

      {tab === "tasks" && (
        <div className="space-y-2">
          {project.status === "active" && (
            <Button className="mb-3" onClick={() => setNewTaskFor({ projectId })}>
              <Plus size={16} /> {t("erp.tasks.new")}
            </Button>
          )}
          {sortedTasks.map((task) => (
            <TaskRow key={task.id} task={task} lookups={lookups} now={now} onOpen={setOpenTaskId} showAssignee />
          ))}
          {sortedTasks.length === 0 && <p className="py-10 text-center text-white/40">{t("erp.tasks.none")}</p>}
        </div>
      )}

      {tab === "settings" && canManage && <ProjectSettings key={project.id} project={project} lookups={lookups} onSaved={load} />}

      <Modal open={Boolean(cell)} onClose={() => setCell(null)} title={t("erp.projects.cell")}>
        {cell && (
          <CellModal
            project={project}
            cell={cell}
            canManage={canManageStage(project.stages.find((s) => s.key === cell.stage))}
            lookups={lookups}
            onClose={() => setCell(null)}
            onChanged={load}
            onOpenTask={(id) => {
              setCell(null);
              setOpenTaskId(id);
            }}
            onNewTask={() => {
              setNewTaskFor({ projectId, stage: cell.stage });
              setCell(null);
            }}
          />
        )}
      </Modal>

      <Modal open={Boolean(newTaskFor)} onClose={() => setNewTaskFor(null)} title={t("erp.tasks.new")} wide>
        {newTaskFor && (
          <TaskForm
            lookups={{ ...lookups, projects: lookups.projects.some((p) => p.id === projectId) ? lookups.projects : [...lookups.projects, project] }}
            preset={newTaskFor}
            onCancel={() => setNewTaskFor(null)}
            onCreated={(task) => {
              setNewTaskFor(null);
              load();
              setOpenTaskId(task.id);
            }}
          />
        )}
      </Modal>

      <TaskDrawer
        taskId={openTaskId}
        lookups={lookups}
        onClose={() => setOpenTaskId(null)}
        onChanged={load}
        onOpenTask={setOpenTaskId}
      />
    </div>
  );
}
