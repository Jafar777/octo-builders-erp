"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { api, errorText } from "@/lib/clientApi";
import BilingualField from "@/components/dashboard/BilingualField";
import Modal from "@/components/erp/ui/Modal";
import { Button, Card, ErrorText, Label, PageHeader, Select, Toggle } from "@/components/erp/ui/fields";
import { useTaskLookups } from "@/components/erp/tasks/useTaskLookups";
import { SkeletonCards } from "@/components/erp/ui/Loading";
import StageRouting, { canRouteStages } from "@/components/erp/projects/StageRouting";

function TemplateEditor({ template, lookups, onSaved, onClose }) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const canRoute = canRouteStages(user);
  const [form, setForm] = useState({
    name: template?.name || { ar: "", en: "" },
    department: template?.department || "",
    stages: template?.stages || [{ key: "", name: { ar: "", en: "" }, taskType: "other" }],
    active: template?.active !== false,
  });
  const [error, setError] = useState("");
  const setStage = (i, patch) => setForm((f) => ({ ...f, stages: f.stages.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));

  async function save() {
    setError("");
    try {
      const body = form;
      const { template: saved } = template
        ? await api(`/api/project-templates/${template.id}`, { method: "PATCH", body })
        : await api("/api/project-templates", { method: "POST", body });
      onSaved(saved);
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  return (
    <div className="space-y-4">
      <BilingualField label={t("erp.projects.templateName")} value={form.name} onChange={(name) => setForm((f) => ({ ...f, name }))} />
      <Select
        label={t("erp.org.department")}
        value={form.department}
        onChange={(department) => setForm((f) => ({ ...f, department }))}
        placeholder="—"
        options={lookups.departments.map((d) => ({ value: d.id, label: d.name?.[lang] }))}
      />
      <div className="space-y-2">
        <Label>{t("erp.projects.stages")}</Label>
        {canRoute && <p className="text-xs text-white/40">{t("erp.projects.routingHint")}</p>}
        {form.stages.map((stage, i) => (
          <div key={i} className="grid items-end gap-2 rounded-xl border border-white/10 p-3 sm:grid-cols-[1fr_170px_auto]">
            <BilingualField label={`${t("erp.projects.stage")} ${i + 1}`} value={stage.name} onChange={(name) => setStage(i, { name })} />
            <Select
              label={t("erp.tasks.type")}
              value={stage.taskType}
              onChange={(taskType) => setStage(i, { taskType })}
              options={lookups.settings.taskTypes.map((tt) => ({ value: tt.key, label: tt.name?.[lang] }))}
            />
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, stages: f.stages.filter((_, j) => j !== i) }))}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-500/30 text-red-400"
              aria-label={t("common.delete")}
            >
              <Trash2 size={15} />
            </button>
            {canRoute && (
              <div className="sm:col-span-3">
                <StageRouting stage={stage} departments={lookups.departments} onChange={(patch) => setStage(i, patch)} />
              </div>
            )}
          </div>
        ))}
        <Button variant="ghost" onClick={() => setForm((f) => ({ ...f, stages: [...f.stages, { key: "", name: { ar: "", en: "" }, taskType: "other" }] }))}>
          <Plus size={16} /> {t("erp.projects.addStage")}
        </Button>
      </div>
      <Toggle checked={form.active} onChange={(active) => setForm((f) => ({ ...f, active }))} label={t("erp.org.active")} />
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button onClick={save}>{t("common.save")}</Button>
      </div>
    </div>
  );
}

export default function TemplatesManager() {
  const { t, lang } = useLanguage();
  const lookups = useTaskLookups();
  const [templates, setTemplates] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/project-templates")
      .then((d) => setTemplates(d.templates))
      .catch((err) => setError(errorText(t, err)));
  }, [t]);

  async function remove(tpl) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    await api(`/api/project-templates/${tpl.id}`, { method: "DELETE" }).catch(() => {});
    setTemplates((l) => (l || []).filter((x) => x.id !== tpl.id));
  }

  return (
    <div className="max-w-5xl">
      <Link href="/dashboard/projects" className="mb-4 inline-flex items-center gap-2 text-sm text-white/55 hover:text-white">
        <ArrowLeft size={15} className="rtl:rotate-180" /> {t("erp.nav.projects")}
      </Link>
      <PageHeader
        title={t("erp.projects.templates")}
        subtitle={t("erp.projects.templatesSubtitle")}
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus size={16} /> {t("erp.projects.newTemplate")}
          </Button>
        }
      />
      <ErrorText>{error}</ErrorText>
      {templates === null && !error && <SkeletonCards count={4} className="md:!grid-cols-2" />}
      <div className="grid gap-4 md:grid-cols-2">
        {(templates || []).map((tpl) => (
          <Card key={tpl.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{tpl.name?.[lang]}</p>
                <p className="text-xs text-white/45">
                  {lookups.departmentName(tpl.department)} · {tpl.stages.length} {t("erp.projects.stagesCount")}
                  {!tpl.active && ` · ${t("erp.org.inactive")}`}
                </p>
              </div>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => setEditing(tpl)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/60 hover:bg-white/10">
                  <Pencil size={14} />
                </button>
                <button type="button" onClick={() => remove(tpl)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs">
              {tpl.stages.map((s, i) => (
                <span key={s.key} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-white/25">←</span>}
                  <span className="rounded-full bg-white/10 px-2.5 py-1 text-white/75">
                    {s.name?.[lang]}
                    {s.department && s.department !== tpl.department && <span className="text-brand-orange"> · {lookups.departmentName(s.department)}</span>}
                  </span>
                </span>
              ))}
            </div>
          </Card>
        ))}
      </div>
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={t("erp.projects.templates")} wide>
        {editing && (
          <TemplateEditor
            template={editing === "new" ? null : editing}
            lookups={lookups}
            onClose={() => setEditing(null)}
            onSaved={(saved) => {
              setTemplates((l) => (l.some((x) => x.id === saved.id) ? l.map((x) => (x.id === saved.id ? saved : x)) : [...l, saved]));
              setEditing(null);
            }}
          />
        )}
      </Modal>
    </div>
  );
}
