"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { api, errorText } from "@/lib/clientApi";
import BilingualField from "@/components/dashboard/BilingualField";
import { Button, ErrorText, Input, Select } from "@/components/erp/ui/fields";
import ScaleSelect from "@/components/erp/projects/ScaleSelect";
import { FlowSelect } from "@/components/erp/projects/StageRouting";
import { ArrowDownToLine, Shuffle } from "lucide-react";

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
    scale: "",
    flow: "",
    stageWaits: {}, // mixed projects: { stageKey: true = waits for the earlier stages }
    folderLink: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));

  useEffect(() => {
    api("/api/project-templates")
      .then((d) => setTemplates(d.templates.filter((x) => x.active)))
      .catch(() => {});
  }, []);

  // Suggest the department's template when the department changes.
  function pickDepartment(department) {
    const match = templates.find((x) => x.department === department);
    setForm((f) => ({ ...f, department, templateId: match?.id || f.templateId }));
  }

  const template = templates.find((x) => x.id === form.templateId);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const { project } = await api("/api/work-projects", { method: "POST", body: form });
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
          onChange={set("templateId")}
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
        <div className="sm:col-span-2">
          <ScaleSelect scales={lookups.settings.projectScales} value={form.scale} onChange={set("scale")} />
        </div>
      </div>

      <FlowSelect value={form.flow} onChange={set("flow")} />
      {form.flow === "mixed" && template && (
        <div className="rounded-xl border border-white/10 p-3">
          <p className="mb-2 text-xs text-white/50">{t("erp.flow.mixedPick")}</p>
          <ol className="space-y-1.5">
            {template.stages.map((s, i) => {
              const waits = i > 0 && (s.key in form.stageWaits ? form.stageWaits[s.key] : Boolean(s.waitForPrevious));
              return (
                <li key={s.key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-5 text-xs text-white/40">{i + 1}</span> {s.name?.[lang]}
                  </span>
                  {i === 0 ? (
                    <span className="text-xs text-white/40">{t("erp.flow.first")}</span>
                  ) : (
                    <span className="flex gap-1 rounded-lg border border-white/10 p-0.5">
                      {[false, true].map((w) => {
                        const Icon = w ? ArrowDownToLine : Shuffle;
                        return (
                          <button
                            key={String(w)}
                            type="button"
                            onClick={() => setForm((f) => ({ ...f, stageWaits: { ...f.stageWaits, [s.key]: w } }))}
                            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs ${waits === w ? "bg-brand-orange text-white" : "text-white/55 hover:text-white"}`}
                          >
                            <Icon size={12} /> {t(w ? "erp.flow.waits" : "erp.flow.anytime")}
                          </button>
                        );
                      })}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
      <p className="text-xs text-white/40">{t("erp.projects.mainDepartmentHint")}</p>
      <p className="text-xs text-white/40">{t("erp.projects.dueRequiredNote")}</p>
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button onClick={save} disabled={saving || !form.templateId || !form.scale || !form.flow}>
          {t("erp.projects.create")}
        </Button>
      </div>
    </div>
  );
}
