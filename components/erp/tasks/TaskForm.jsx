"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { api, errorText } from "@/lib/clientApi";
import { Button, ErrorText, Input, Label, Select } from "@/components/erp/ui/fields";
import { DependencyPicker, RecurrenceFields } from "@/components/erp/tasks/TaskPlanning";

const KINDS = ["task", "meeting", "personal"];

// Create a task. `preset` fixes the project / item / stage when opened from a board
// cell, or `preset.parent` (a task) for a sub-task.
export default function TaskForm({ lookups, preset = {}, onCreated, onCancel }) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const canAssign = user?.permissions?.includes("tasks.assign");
  const [form, setForm] = useState({
    kind: "task",
    projectId: preset.projectId || "",
    itemId: preset.itemId || "",
    stage: preset.stage || "",
    type: "",
    title: "",
    assigneeId: user?.id || "",
    dueAt: "",
    plannedStart: "",
    estimatedHours: "",
    priority: "normal",
    description: "",
    dependsOn: [],
    recurrence: { freq: "", interval: 1, until: "" },
  });
  const parent = preset.parent || null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));

  const openProjects = lookups.projects.filter((p) => ["active", "on_hold"].includes(p.status));
  const project = lookups.projects.find((p) => p.id === form.projectId);
  const stage = project?.stages.find((s) => s.key === form.stage);
  const fixedCell = Boolean(preset.itemId);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const body = {
        ...form,
        type: form.type || stage?.taskType || "",
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
        plannedStart: form.plannedStart ? new Date(form.plannedStart).toISOString() : null,
      };
      if (body.kind !== "task" && !body.projectId) {
        body.itemId = "";
        body.stage = "";
      }
      if (parent) body.parentTaskId = parent.id;
      body.recurrence = form.recurrence.freq
        ? { ...form.recurrence, interval: Number(form.recurrence.interval) || 1, until: form.recurrence.until || null }
        : null;
      const { task } = await api("/api/tasks", { method: "POST", body });
      onCreated(task);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {parent && (
        <p className="rounded-xl bg-white/5 px-3 py-2 text-sm text-white/70">
          {t("erp.tasks.subtaskOf")} <span dir="ltr">#{parent.number}</span>
        </p>
      )}

      {!fixedCell && !parent && (
        <div className="flex gap-1 rounded-xl border border-white/10 p-1">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => set("kind")(k)}
              className={`flex-1 rounded-lg py-2 text-sm ${form.kind === k ? "bg-brand-orange text-white" : "text-white/60"}`}
            >
              {t(`erp.tasks.kind.${k}`)}
            </button>
          ))}
        </div>
      )}

      {!fixedCell && !parent && (
        <Select
          label={`${t("erp.tasks.project")}${form.kind === "task" ? "" : ` ${t("dashboard.optional")}`}`}
          value={form.projectId}
          onChange={(projectId) => setForm((f) => ({ ...f, projectId, itemId: "", stage: "" }))}
          placeholder="—"
          options={openProjects.map((p) => ({ value: p.id, label: `${p.code ? `${p.code} · ` : ""}${p.name?.[lang]}` }))}
        />
      )}

      {project && !fixedCell && !parent && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={t("erp.tasks.item")}
            value={form.itemId}
            onChange={set("itemId")}
            placeholder="—"
            options={project.items.map((i) => ({ value: i.id, label: i.name }))}
          />
          <Select
            label={t("erp.tasks.stage")}
            value={form.stage}
            onChange={set("stage")}
            placeholder="—"
            options={project.stages.map((s) => ({ value: s.key, label: s.name?.[lang] }))}
          />
        </div>
      )}

      {fixedCell && project && (
        <p className="rounded-xl bg-white/5 px-3 py-2 text-sm text-white/70">
          {project.name?.[lang]} · {project.items.find((i) => i.id === form.itemId)?.name} · {stage?.name?.[lang]}
        </p>
      )}

      <Input
        label={`${t("erp.tasks.title")}${form.kind === "task" ? ` ${t("dashboard.optional")}` : ""}`}
        value={form.title}
        onChange={set("title")}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label={t("erp.tasks.type")}
          value={form.type || stage?.taskType || ""}
          onChange={set("type")}
          placeholder="—"
          options={lookups.settings.taskTypes.map((tt) => ({ value: tt.key, label: tt.name?.[lang] }))}
        />
        {canAssign ? (
          <Select
            label={t("erp.tasks.assignee")}
            value={form.assigneeId}
            onChange={set("assigneeId")}
            options={lookups.people.map((p) => ({ value: p.id, label: p.id === user?.id ? `${p.name} (${t("erp.messages.you")})` : p.name }))}
          />
        ) : (
          <Select
            label={t("erp.tasks.priorityLabel")}
            value={form.priority}
            onChange={set("priority")}
            options={["normal", "important", "urgent"].map((p) => ({ value: p, label: t(`erp.tasks.priority.${p}`) }))}
          />
        )}
        <Input type="datetime-local" label={t("erp.tasks.dueAt")} value={form.dueAt} onChange={set("dueAt")} />
        <Input type="datetime-local" label={`${t("erp.tasks.plannedStart")} ${t("dashboard.optional")}`} value={form.plannedStart} onChange={set("plannedStart")} />
        <Input type="number" min="0" step="0.5" label={t("erp.tasks.estimatedHours")} value={form.estimatedHours} onChange={set("estimatedHours")} dir="ltr" />
        {canAssign && (
          <Select
            label={t("erp.tasks.priorityLabel")}
            value={form.priority}
            onChange={set("priority")}
            options={["normal", "important", "urgent"].map((p) => ({ value: p, label: t(`erp.tasks.priority.${p}`) }))}
          />
        )}
      </div>

      <div>
        <Label>{`${t("erp.tasks.description")} ${t("dashboard.optional")}`}</Label>
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) => set("description")(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-white/30"
        />
      </div>

      <details className="rounded-xl border border-white/10 px-3 py-2" open={false}>
        <summary className="cursor-pointer text-sm text-white/70">{t("erp.tasks.planning")}</summary>
        <div className="mt-3 space-y-4">
          <DependencyPicker
            value={form.dependsOn}
            onChange={set("dependsOn")}
            projectId={parent?.project?.id || form.projectId || ""}
          />
          {!form.itemId && <RecurrenceFields value={form.recurrence} onChange={set("recurrence")} />}
        </div>
      </details>

      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button onClick={save} disabled={saving}>
          {t("erp.tasks.create")}
        </Button>
      </div>
    </div>
  );
}
