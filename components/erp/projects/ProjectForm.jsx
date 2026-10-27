"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { api, errorText } from "@/lib/clientApi";
import BilingualField from "@/components/dashboard/BilingualField";
import { Button, ErrorText, Input, Select } from "@/components/erp/ui/fields";
import StageFlowEditor from "@/components/erp/projects/StageFlowEditor";
import { stageAfter, stepByStep } from "@/lib/stageFlow";

export default function ProjectForm({ lookups, onCreated, onCancel }) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState({
    name: { ar: "", en: "" },
    code: "",
    client: "",
    department: user?.scope === "department" ? user.department || "" : "",
    templateId: "",
    startDate: "",
    dueDate: "",
    priority: "normal",
    tasks: {}, // { stageKey: { hours, assigneeId } } — one scheduled task per template stage
    folderLink: "",
  });
  // The template's stages in the chosen order, each with the stages it waits for.
  const [stages, setStages] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));

  useEffect(() => {
    api("/api/project-templates")
      .then((d) => setTemplates(d.templates.filter((x) => x.active)))
      .catch(() => {});
  }, []);

  // A template opens step by step; the GM can then reorder and branch it.
  function pickTemplate(templateId) {
    if (templateId === form.templateId) return;
    setForm((f) => ({ ...f, templateId }));
    const next = templates.find((x) => x.id === templateId);
    setStages(next ? stepByStep(next.stages) : []);
  }

  // Suggest the department's template when the department changes.
  function pickDepartment(department) {
    const match = templates.find((x) => x.department === department);
    setForm((f) => ({ ...f, department }));
    if (match) pickTemplate(match.id);
  }

  const template = templates.find((x) => x.id === form.templateId);
  const taskOf = (key) => form.tasks[key] || { hours: "", assigneeId: "" };
  const setTask = (key, patch) => setForm((f) => ({ ...f, tasks: { ...f.tasks, [key]: { ...taskOf(key), ...patch } } }));
  const tasksReady = Boolean(stages.length) && stages.every((s) => Number(taskOf(s.key).hours) >= 0.5 && taskOf(s.key).assigneeId);
  // The stage's own department first in the employee list.
  const peopleFor = (stage) => {
    const dep = stage.department || form.department;
    return [...lookups.people]
      .sort((a, b) => (a.department === dep ? 0 : 1) - (b.department === dep ? 0 : 1) || a.name.localeCompare(b.name))
      .map((p) => ({ value: p.id, label: p.name }));
  };

  async function save() {
    setSaving(true);
    setError("");
    try {
      const tasks = Object.fromEntries(stages.map((s) => [s.key, { hours: Number(taskOf(s.key).hours), assigneeId: taskOf(s.key).assigneeId }]));
      const stagePlan = stages.map((s, i) => ({ key: s.key, after: stageAfter(stages, i) }));
      const { project } = await api("/api/work-projects", { method: "POST", body: { ...form, tasks, stagePlan } });
      onCreated(project);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <BilingualField label={t("erp.projects.name")} value={form.name} onChange={set("name")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={t("erp.projects.code")} value={form.code} onChange={set("code")} dir="ltr" placeholder="M9, E19..." />
        <Input label={t("erp.projects.client")} value={form.client} onChange={set("client")} />
        <Select
          label={t("erp.projects.mainDepartment")}
          value={form.department}
          onChange={pickDepartment}
          placeholder="—"
          options={lookups.departments.map((d) => ({ value: d.id, label: d.name?.[lang] }))}
        />
        <Select
          label={t("erp.projects.template")}
          value={form.templateId}
          onChange={pickTemplate}
          placeholder="—"
          options={templates.map((x) => ({ value: x.id, label: x.name?.[lang] }))}
        />
        <Input type="date" label={t("erp.projects.startDate")} value={form.startDate} onChange={set("startDate")} />
        <Input type="date" label={t("erp.projects.dueDate")} value={form.dueDate} onChange={set("dueDate")} />
        <Select
          label={t("erp.tasks.priorityLabel")}
          value={form.priority}
          onChange={set("priority")}
          options={["normal", "important", "urgent"].map((p) => ({ value: p, label: t(`erp.tasks.priority.${p}`) }))}
        />
        <Input label={t("erp.projects.folderLink")} value={form.folderLink} onChange={set("folderLink")} dir="ltr" />
      </div>

      {template && (
        <div className="rounded-xl border border-white/10 p-3">
          <p className="mb-1 text-sm font-medium text-white/70">{t("erp.plan.tasksTitle")}</p>
          <p className="mb-3 text-xs text-white/50">{t("erp.plan.tasksHint")}</p>
          <StageFlowEditor
            stages={stages}
            onChange={setStages}
            renderRow={(s) => (
              <div className="grid gap-2 sm:grid-cols-[110px_1fr]">
                <Input
                  type="number"
                  min="0.5"
                  max="200"
                  step="0.5"
                  label={t("erp.plan.hours")}
                  value={taskOf(s.key).hours}
                  onChange={(hours) => setTask(s.key, { hours })}
                  dir="ltr"
                />
                <Select
                  label={t("erp.tasks.assignee")}
                  value={taskOf(s.key).assigneeId}
                  onChange={(assigneeId) => setTask(s.key, { assigneeId })}
                  placeholder="—"
                  options={peopleFor(s)}
                />
              </div>
            )}
          />
        </div>
      )}
      <p className="text-xs text-white/40">{t("erp.projects.mainDepartmentHint")}</p>
      <p className="text-xs text-white/40">{t("erp.projects.dueRequiredNote")}</p>
      <p className="text-xs text-white/40">{t("erp.plan.scheduleNote")}</p>
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button onClick={save} disabled={saving || !form.templateId || !tasksReady}>
          {t("erp.projects.create")}
        </Button>
      </div>
    </div>
  );
}
