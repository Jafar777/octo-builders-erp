"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { api, errorText } from "@/lib/clientApi";
import BilingualField from "@/components/dashboard/BilingualField";
import { Button, ErrorText, Input, Select } from "@/components/erp/ui/fields";

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
          label={t("erp.org.department")}
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
      </div>
      <p className="text-xs text-white/40">{t("erp.projects.dueRequiredNote")}</p>
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button onClick={save} disabled={saving || !form.templateId}>
          {t("erp.projects.create")}
        </Button>
      </div>
    </div>
  );
}
