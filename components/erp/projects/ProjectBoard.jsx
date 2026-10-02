"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowDown, ArrowUp, CalendarDays, ExternalLink, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
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

const TABS = ["board", "tasks", "settings"];

function CellModal({ project, cell, canManage, lookups, onOpenTask, onNewTask, onChanged, onClose }) {
  const { t, lang } = useLanguage();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const item = project.items.find((i) => i.id === cell.itemId);
  const stage = project.stages.find((s) => s.key === cell.stage);
  const state = project.cells[cell.itemId]?.[cell.stage];
  const assignee = lookups.people.find((p) => p.id === state?.assignee);

  async function override(status) {
    setError("");
    try {
      await api(`/api/work-projects/${project.id}/override`, {
        method: "POST",
        body: { itemId: cell.itemId, stage: cell.stage, status, reason },
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
        {item?.name} · {stage?.name?.[lang]}
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

      <div className="flex flex-wrap gap-2">
        {state?.taskId && (
          <Button variant="ghost" onClick={() => onOpenTask(state.taskId)}>
            {t("erp.projects.openTask")}
          </Button>
        )}
        {project.status === "active" && (
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
  const [form, setForm] = useState({
    name: project.name,
    code: project.code,
    client: project.client,
    status: project.status,
    priority: project.priority,
    startDate: toDateInput(project.startDate),
    dueDate: toDateInput(project.dueDate),
    folderLink: project.folderLink,
    participants: project.participants,
  });
  const [items, setItems] = useState(project.items);
  const [bulk, setBulk] = useState("");
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
        body: { ...form, items, stages, ...extra },
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
        <p className="font-semibold">{t("erp.projects.items")}</p>
        <p className="text-xs text-white/45">{t("erp.projects.itemsHint")}</p>
        <div className="space-y-1.5">
          {items.map((item, i) => (
            <div key={item.id || i} className="flex items-center gap-2">
              <input
                value={item.name}
                onChange={(e) => setItems((list) => list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                dir="ltr"
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/30"
              />
              <button type="button" onClick={() => setItems((l) => move(l, i, i - 1))} className="p-1.5 text-white/50 hover:text-white" aria-label={t("dashboard.moveUp")}>
                <ArrowUp size={14} />
              </button>
              <button type="button" onClick={() => setItems((l) => move(l, i, i + 1))} className="p-1.5 text-white/50 hover:text-white" aria-label={t("dashboard.moveDown")}>
                <ArrowDown size={14} />
              </button>
              <button type="button" onClick={() => setItems((l) => l.filter((_, j) => j !== i))} className="p-1.5 text-red-400 hover:text-red-300" aria-label={t("common.delete")}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <textarea
          rows={3}
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          placeholder={t("erp.projects.bulkPlaceholder")}
          dir="ltr"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-white/30"
        />
        <Button
          variant="ghost"
          onClick={() => {
            const names = bulk.split("\n").map((x) => x.trim()).filter(Boolean);
            setItems((l) => [...l, ...names.map((name) => ({ name }))]);
            setBulk("");
          }}
          disabled={!bulk.trim()}
        >
          <Plus size={16} /> {t("erp.projects.addItems")}
        </Button>
      </Card>

      <Card className="space-y-3">
        <p className="font-semibold">{t("erp.projects.stages")}</p>
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

  const departmentChannel = data ? `private-department-${data.project.department}` : null;
  const onTaskEvent = (e) => e.projectId === projectId && load();
  useRealtimeEvent(departmentChannel, "task:updated", onTaskEvent);
  useRealtimeEvent(departmentChannel, "project:updated", (e) => e.id === projectId && load());

  const now = useNow(tasks.some((x) => x.status === "in_progress"));
  const project = data?.project;
  const canManage = data?.access === "manage";
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
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead className="bg-white/[0.04] text-xs text-white/55">
              <tr>
                <th className="sticky start-0 z-10 bg-brand-navy px-3 py-3 text-start font-medium">{t("erp.tasks.item")}</th>
                <th className="px-2 py-3 text-center font-medium">%</th>
                {project.stages.map((s) => (
                  <th key={s.key} className="px-2 py-3 text-center font-medium">
                    {s.name?.[lang]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {project.items.map((item) => (
                <tr key={item.id} className="border-t border-white/5">
                  <td className="sticky start-0 z-10 max-w-60 truncate bg-brand-navy px-3 py-2 font-medium" dir="ltr" title={item.name}>
                    {item.name}
                  </td>
                  <td className="px-2 py-2 text-center text-xs text-white/50" dir="ltr">
                    {Math.round((project.cells[item.id]?._progress || 0) * 100)}%
                  </td>
                  {project.stages.map((s) => {
                    const c = project.cells[item.id]?.[s.key] || { status: "not_started" };
                    const person = lookups.people.find((p) => p.id === c.assignee);
                    return (
                      <td key={s.key} className="px-1.5 py-1.5">
                        <button
                          type="button"
                          onClick={() => setCell({ itemId: item.id, stage: s.key })}
                          className={`flex h-12 w-full min-w-24 flex-col items-center justify-center rounded-lg border px-1 text-[11px] leading-tight transition hover:brightness-125 ${STATUS_STYLE[c.status] || STATUS_STYLE.not_started}`}
                        >
                          <span className="font-medium">{t(`erp.tasks.status.${c.status}`)}</span>
                          {c.number && (
                            <span className="opacity-70" dir="ltr">
                              #{c.number} · {revisionLabel(c.revision)}
                              {person ? ` · ${person.name.split(" ")[0]}` : ""}
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {project.items.length === 0 && (
                <tr>
                  <td colSpan={project.stages.length + 2} className="px-4 py-10 text-center text-white/40">
                    {canManage ? t("erp.projects.noItemsManage") : t("erp.projects.noItems")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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

      {tab === "settings" && canManage && <ProjectSettings key={project.id + project.items.length} project={project} lookups={lookups} onSaved={load} />}

      <Modal open={Boolean(cell)} onClose={() => setCell(null)} title={t("erp.projects.cell")}>
        {cell && (
          <CellModal
            project={project}
            cell={cell}
            canManage={canManage}
            lookups={lookups}
            onClose={() => setCell(null)}
            onChanged={load}
            onOpenTask={(id) => {
              setCell(null);
              setOpenTaskId(id);
            }}
            onNewTask={() => {
              setNewTaskFor({ projectId, itemId: cell.itemId, stage: cell.stage });
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
