"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { api, errorText } from "@/lib/clientApi";
import { Button, ErrorText, Input, Label, Select } from "@/components/erp/ui/fields";
import { canRouteStages } from "@/components/erp/projects/StageRouting";
import { AlertTriangle, Timer } from "lucide-react";

const KINDS = ["task", "meeting", "personal"];

// Create a task. `preset` fixes the project / stage when opened from a board
// cell, or `preset.parent` (a task) for a sub-task. Time is not entered here: a
// project task gets its hours from the project scale and its clock starts when the
// employee presses Start. Only the GM / CEO may set a due date by hand.
export default function TaskForm({ lookups, preset = {}, onCreated, onCancel }) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const canAssign = user?.permissions?.includes("tasks.assign");
  const [form, setForm] = useState({
    kind: "task",
    projectId: preset.projectId || "",
    stage: preset.stage || "",
    type: "",
    title: "",
    assigneeId: user?.id || "",
    dueAt: "",
    priority: "normal",
    description: "",
  });
  const parent = preset.parent || null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));

  const openProjects = lookups.projects.filter((p) => ["active", "on_hold"].includes(p.status));
  const project = lookups.projects.find((p) => p.id === form.projectId);
  const stage = project?.stages.find((s) => s.key === form.stage);
  const fixedCell = Boolean(preset.stage);
  const isScheduler = canRouteStages(user);
  // Project scale: tasks get its hours; only the GM / CEO set their own due date.
  const scaleProject = project || lookups.projects.find((p) => p.id === parent?.project?.id);
  const scale = form.kind === "task" ? (lookups.settings.projectScales || []).find((s) => s.key === scaleProject?.scale) : null;
  const missingScale = form.kind === "task" && Boolean(scaleProject) && !scale && !isScheduler;

  async function save() {
    setSaving(true);
    setError("");
    try {
      const body = {
        ...form,
        type: form.type || stage?.taskType || "",
        dueAt: isScheduler && form.dueAt ? new Date(form.dueAt).toISOString() : null,
      };
      if (body.kind !== "task" && !body.projectId) {
        body.stage = "";
      }
      if (parent) body.parentTaskId = parent.id;
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
          onChange={(projectId) => setForm((f) => ({ ...f, projectId, stage: "" }))}
          placeholder="—"
          options={openProjects.map((p) => ({ value: p.id, label: `${p.code ? `${p.code} · ` : ""}${p.name?.[lang]}` }))}
        />
      )}

      {project && !fixedCell && !parent && (
        <Select
          label={t("erp.tasks.stage")}
          value={form.stage}
          onChange={set("stage")}
          placeholder="—"
          options={project.stages.map((s) => ({ value: s.key, label: s.name?.[lang] }))}
        />
      )}

      {fixedCell && project && (
        <p className="rounded-xl bg-white/5 px-3 py-2 text-sm text-white/70">
          {project.name?.[lang]} · {stage?.name?.[lang]}
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
        {isScheduler && (
          <Input
            type="datetime-local"
            label={`${t("erp.tasks.dueAt")}${scale || form.kind !== "task" ? ` ${t("dashboard.optional")}` : ""}`}
            value={form.dueAt}
            onChange={set("dueAt")}
          />
        )}
        {canAssign && (
          <Select
            label={t("erp.tasks.priorityLabel")}
            value={form.priority}
            onChange={set("priority")}
            options={["normal", "important", "urgent"].map((p) => ({ value: p, label: t(`erp.tasks.priority.${p}`) }))}
          />
        )}
      </div>

      {scale && (
        <p className="flex items-start gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2.5 text-sm text-sky-100">
          <Timer size={16} className="mt-0.5 shrink-0" />
          <span>
            {t("erp.scale.formInfo", { scale: scale.name?.[lang], h: scale.hours })}
            {isScheduler && <span className="block text-xs text-sky-200/70">{t("erp.scale.formOverride")}</span>}
          </span>
        </p>
      )}
      {missingScale && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-100">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {t("erp.scale.missing")}
        </p>
      )}

      <div>
        <Label>{`${t("erp.tasks.description")} ${t("dashboard.optional")}`}</Label>
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) => set("description")(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-white/30"
        />
      </div>

      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button onClick={save} disabled={saving || missingScale}>
          {t("erp.tasks.create")}
        </Button>
      </div>
    </div>
  );
}
