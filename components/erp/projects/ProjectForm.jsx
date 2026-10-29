"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { api, errorText } from "@/lib/clientApi";
import BilingualField from "@/components/dashboard/BilingualField";
import { Button, ErrorText, Input, Select } from "@/components/erp/ui/fields";
import StageFlowEditor from "@/components/erp/projects/StageFlowEditor";
import { stageAfter, stepByStep } from "@/lib/stageFlow";

// Who reviews each task (lib/reviewFlow), in this order: department manager → GM / CEO → customer.
const REVIEW_KEYS = ["manager", "gm", "customer"];
const DEFAULT_REVIEW = { manager: true, gm: false, customer: false };

// The three review boxes of a task (or of all tasks at once).
export function ReviewBoxes({ value, onChange, hasCustomer, t }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
      <span className="text-white/45">{t("erp.reviews.reviewedBy")}</span>
      {REVIEW_KEYS.map((k) => {
        const disabled = k === "customer" && !hasCustomer;
        return (
          <label key={k} className={`flex items-center gap-1.5 ${disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`} title={disabled ? t("erp.reviews.needsCustomer") : ""}>
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-brand-orange"
              checked={Boolean(value[k]) && !disabled}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, [k]: e.target.checked })}
            />
            {t(`erp.reviews.box.${k}`)}
          </label>
        );
      })}
    </div>
  );
}

// The intake's priority → the project's (lib/intakeRules PROJECT_PRIORITY).
const INTAKE_PRIORITY = { urgent: "urgent", medium: "important", normal: "normal" };

// `intake`: a priced intake form the project is created from (the GM / CEO): its name,
// priority and the client's date fill the form; the server copies its details into the
// project's notes and turns its money into finance entries.
export default function ProjectForm({ lookups, intake = null, onCreated, onCancel }) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({
    name: { ar: intake?.project.name || "", en: "" },
    code: "",
    customer: "", // a signed-up account with no role (optional)
    department: user?.scope === "department" ? user.department || "" : "",
    templateId: "",
    startDate: "",
    dueDate: intake?.client.requiredDelivery || "",
    priority: INTAKE_PRIORITY[intake?.project.priority] || "normal",
    tasks: {}, // { stageKey: { hours, assigneeId, review } } — one scheduled task per template stage
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
    api("/api/customers")
      .then((d) => setCustomers(d.customers))
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
  const hasCustomer = Boolean(form.customer);
  const taskOf = (key) => form.tasks[key] || { hours: "", assigneeId: "", review: DEFAULT_REVIEW };
  // Without a customer nobody can review as the customer.
  const reviewOf = (key) => ({ ...taskOf(key).review, customer: hasCustomer && Boolean(taskOf(key).review.customer) });
  const allReview = Object.fromEntries(REVIEW_KEYS.map((k) => [k, stages.length > 0 && stages.every((s) => reviewOf(s.key)[k])]));
  // A box of "all tasks" sets that one reviewer on every task; the others stay as they are.
  const setAllReviews = (next) => {
    const key = REVIEW_KEYS.find((k) => next[k] !== allReview[k]);
    if (!key) return;
    setForm((f) => ({
      ...f,
      tasks: Object.fromEntries(stages.map((s) => [s.key, { ...taskOf(s.key), ...f.tasks[s.key], review: { ...taskOf(s.key).review, [key]: next[key] } }])),
    }));
  };
  const setTask = (key, patch) => setForm((f) => ({ ...f, tasks: { ...f.tasks, [key]: { ...taskOf(key), ...patch } } }));
  const tasksReady =
    Boolean(stages.length) &&
    stages.every((s) => Number(taskOf(s.key).hours) >= 0.5 && taskOf(s.key).assigneeId && REVIEW_KEYS.some((k) => reviewOf(s.key)[k]));
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
      const tasks = Object.fromEntries(stages.map((s) => [s.key, { hours: Number(taskOf(s.key).hours), assigneeId: taskOf(s.key).assigneeId, review: reviewOf(s.key) }]));
      const stagePlan = stages.map((s, i) => ({ key: s.key, after: stageAfter(stages, i) }));
      const { project } = await api("/api/work-projects", { method: "POST", body: { ...form, tasks, stagePlan, ...(intake ? { intakeId: intake.id } : {}) } });
      onCreated(project);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {intake && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] px-4 py-3 text-sm">
          <p className="font-semibold text-emerald-100">{t("erp.intake.fromIntake", { n: intake.number, client: intake.client.name })}</p>
          <p className="mt-1 text-xs text-white/55">{t("erp.intake.fromIntakeHint")}</p>
          {intake.finance && (
            <p className="mt-1 text-xs text-emerald-200" dir="auto">
              {t("erp.intake.fromIntakeMoney", {
                value: `${Number(intake.finance.contractValue).toLocaleString()} ${intake.finance.currency}`,
                advance: intake.finance.advancePaid > 0 ? `${Number(intake.finance.advancePaid).toLocaleString()} ${intake.finance.currency}` : "—",
              })}
            </p>
          )}
        </div>
      )}
      <BilingualField label={t("erp.projects.name")} value={form.name} onChange={set("name")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={t("erp.projects.code")} value={form.code} onChange={set("code")} dir="ltr" placeholder="M9, E19..." />
        <CustomerSelect customers={customers} value={form.customer} onChange={set("customer")} t={t} />
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
          <div className="mb-3 rounded-lg bg-white/[0.04] px-3 py-2">
            <p className="mb-1 text-[11px] text-white/45">{t("erp.reviews.allTasks")}</p>
            <ReviewBoxes value={allReview} onChange={setAllReviews} hasCustomer={hasCustomer} t={t} />
          </div>
          <StageFlowEditor
            stages={stages}
            onChange={setStages}
            renderRow={(s) => (
              <div className="space-y-2">
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
                <ReviewBoxes value={reviewOf(s.key)} onChange={(review) => setTask(s.key, { review })} hasCustomer={hasCustomer} t={t} />
                {!REVIEW_KEYS.some((k) => reviewOf(s.key)[k]) && <p className="text-[11px] text-red-300">{t("errors.review_required")}</p>}
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

// The project's customer: someone who signed up and has no role (employees, managers and
// the GM / CEO never appear). Optional.
export function CustomerSelect({ customers, value, onChange, t, legacy = "", currentName = "" }) {
  const options = customers.map((c) => ({ value: c.id, label: c.name && c.name !== c.email ? `${c.name} · ${c.email}` : c.email }));
  // The project's customer stays listed even after they were given a role.
  if (value && !customers.some((c) => c.id === value)) options.unshift({ value, label: currentName || "—" });
  return (
    <div>
      <Select
        label={t("erp.projects.client")}
        value={value}
        onChange={onChange}
        placeholder={t("erp.projects.noCustomer")}
        options={options}
      />
      <p className="mt-1 text-[11px] text-white/40">{legacy && !value ? t("erp.projects.legacyClient", { name: legacy }) : t("erp.projects.customerHint")}</p>
    </div>
  );
}
