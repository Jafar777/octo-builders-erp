"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { api, errorText } from "@/lib/clientApi";
import BilingualField from "@/components/dashboard/BilingualField";
import { Button, ErrorText, Input, Select } from "@/components/erp/ui/fields";
import StageFlowEditor from "@/components/erp/projects/StageFlowEditor";
import { stageAfter, stepByStep } from "@/lib/stageFlow";
import { canRouteStages } from "@/components/erp/projects/StageRouting";
import { Building2, Check, Star } from "lucide-react";

// Who reviews each task (lib/reviewFlow): always the department manager, who may send
// it on to the CEO when reviewing ("accept if the CEO accepts"). Only the customer's
// review (projects with a customer) is chosen here.
const REVIEW_KEYS = ["customer"];
const DEFAULT_REVIEW = { manager: true, gm: false, customer: false };

// "Reviewed by the department manager", and the customer's box when there's a customer.
export function ReviewBoxes({ value, onChange, hasCustomer, t }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
      <span className="text-white/60">{t("erp.reviews.reviewedBy")}</span>
      <span className="rounded-full border border-emerald-400/30 px-2 py-0.5 text-emerald-200/90">✓ {t("erp.reviews.box.manager")}</span>
      {hasCustomer && (
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-brand-orange"
            checked={Boolean(value.customer)}
            onChange={(e) => onChange({ ...value, manager: true, gm: false, customer: e.target.checked })}
          />
          {t("erp.reviews.box.customer")}
        </label>
      )}
    </div>
  );
}

// Above a task: the employee who clearly does this type of task best (lib/kpi/bestFor).
function BestForNote({ best, assigned, onAssign, t }) {
  if (!best) return null;
  const facts = [
    best.firstTimePct !== null && t("erp.tasks.bestFor.firstTime", { n: best.firstTimePct }),
    best.onTimePct !== null && t("erp.tasks.bestFor.onTime", { n: best.onTimePct }),
    best.speedPct !== null && t(best.speedPct >= 0 ? "erp.tasks.bestFor.faster" : "erp.tasks.bestFor.slower", { n: Math.abs(best.speedPct) }),
    t("erp.tasks.bestFor.lead", { n: best.lead }),
    t("erp.tasks.bestFor.basis", { tasks: best.tasks, people: best.compared }),
  ].filter(Boolean);
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
      <Star size={16} className="mt-0.5 shrink-0 fill-amber-300 text-amber-300" />
      <div className="min-w-0 flex-1">
        <p>
          {t("erp.tasks.bestFor.title")} <span className="font-semibold">{best.name}</span>
        </p>
        <p className="text-xs text-amber-100/70">{facts.join(" · ")}</p>
      </div>
      {assigned ? (
        <span className="flex shrink-0 items-center gap-1 text-xs text-amber-200/80">
          <Check size={14} /> {t("erp.tasks.bestFor.assigned")}
        </span>
      ) : (
        <button type="button" onClick={onAssign} className="shrink-0 rounded-md bg-amber-400/20 px-2 py-1 text-xs font-medium text-amber-100 hover:bg-amber-400/30">
          {t("erp.tasks.bestFor.assign")}
        </button>
      )}
    </div>
  );
}

// The intake's priority → the project's (lib/intakeRules PROJECT_PRIORITY).
const INTAKE_PRIORITY = { urgent: "urgent", medium: "important", normal: "normal" };

// The template's stages in a saved order (a request's stagePlan: [{ key, after }]).
const stagesFromPlan = (template, plan) => {
  const byKey = new Map((template?.stages || []).map((s) => [s.key, s]));
  if (!Array.isArray(plan) || !plan.every((p) => byKey.has(p.key))) return stepByStep(template?.stages || []);
  return plan.map((p) => ({ ...byKey.get(p.key), after: p.after || [] }));
};

// The project set-up of an intake form (lib/intake.js): every project comes from one.
// `mode`: "propose" — a department manager (or the CEO) sends it as a request, nothing
// starts; "accept" — the CEO creates the project now and the Gantt schedules it. No
// dates: the schedule decides when it starts and ends. `initial`: the request's set-up.
// The server copies the intake's details into the project's notes and its money into
// finance entries (the money is the CEO / GM's: it's never shown to a department manager).
export default function ProjectForm({ lookups, intake = null, mode = "accept", initial = null, onCreated, onCancel }) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [customers, setCustomers] = useState([]);
  const ownDepartment = user?.scope === "department";
  const [form, setForm] = useState({
    name: initial?.name || { ar: intake?.project.name || "", en: "" },
    code: initial?.code || "",
    customer: initial?.customer || "", // a signed-up account with no role (optional)
    department: ownDepartment ? user.department || "" : initial?.department || "",
    templateId: initial?.templateId || "",
    priority: initial?.priority || INTAKE_PRIORITY[intake?.project.priority] || "normal",
    tasks: initial?.tasks || {}, // { stageKey: { hours, assigneeId, review } } — one scheduled task per template stage
    folderLink: initial?.folderLink || "",
  });
  // The template's stages in the chosen order, each with the stages it waits for.
  const [stages, setStages] = useState([]);
  // { taskType: best employee } — only types where someone clearly stands out (/api/tasks/best-for).
  const [bestFor, setBestFor] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));

  useEffect(() => {
    api("/api/project-templates")
      .then((d) => {
        const active = d.templates.filter((x) => x.active);
        setTemplates(active);
        // A request's set-up: its template's stages in the order it asked for.
        const chosen = active.find((x) => x.id === initial?.templateId);
        if (chosen) setStages(stagesFromPlan(chosen, initial.stagePlan));
      })
      .catch(() => {});
    api("/api/customers")
      .then((d) => setCustomers(d.customers))
      .catch(() => {});
    // Only once, with the request it opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A template opens step by step; the GM can then reorder and branch it.
  function pickTemplate(templateId) {
    if (templateId === form.templateId) return;
    setForm((f) => ({ ...f, templateId }));
    const next = templates.find((x) => x.id === templateId);
    setStages(next ? stepByStep(next.stages) : []);
    loadBestFor(next?.stages || []);
  }

  // Who is clearly best at each of the template's task types (people who create projects only).
  function loadBestFor(templateStages) {
    setBestFor({});
    const types = [...new Set(templateStages.map((s) => s.taskType).filter(Boolean))];
    if (!types.length || !canRouteStages(user)) return;
    api(`/api/tasks/best-for?types=${encodeURIComponent(types.join(","))}`)
      .then((d) => setBestFor(d.bestFor || {}))
      .catch(() => {});
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
  // Every task is reviewed by its department manager: only hours and an employee are needed.
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
      const tasks = Object.fromEntries(
        stages.map((s) => [
          s.key,
          { hours: Number(taskOf(s.key).hours), assigneeId: taskOf(s.key).assigneeId, review: reviewOf(s.key), externalHours: Number(taskOf(s.key).externalHours) || 0 },
        ])
      );
      const stagePlan = stages.map((s, i) => ({ key: s.key, after: stageAfter(stages, i) }));
      const body = { ...form, tasks, stagePlan };
      if (mode === "propose") {
        const { intake: saved } = await api(`/api/intakes/${intake.id}/proposal`, { method: "PUT", body });
        onCreated(saved);
      } else {
        const { project } = await api("/api/work-projects", { method: "POST", body: { ...body, intakeId: intake.id } });
        onCreated(project);
      }
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
          {mode === "accept" && intake.finance && (
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
          disabled={ownDepartment}
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
          {/* The customer's review for all tasks at once (projects with a customer). */}
          {hasCustomer && (
            <div className="mb-3 rounded-lg bg-white/[0.04] px-3 py-2">
              <p className="mb-1 text-[11px] text-white/60">{t("erp.reviews.allTasks")}</p>
              <ReviewBoxes value={allReview} onChange={setAllReviews} hasCustomer={hasCustomer} t={t} />
            </div>
          )}
          <p className="mb-3 text-[11px] text-white/60">{t("erp.reviews.managerAlways")}</p>
          <StageFlowEditor
            stages={stages}
            onChange={setStages}
            renderRow={(s) => (
              <div className="space-y-2">
                <BestForNote
                  best={bestFor[s.taskType]}
                  assigned={taskOf(s.key).assigneeId === bestFor[s.taskType]?.userId}
                  onAssign={() => setTask(s.key, { assigneeId: bestFor[s.taskType].userId })}
                  t={t}
                />
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
                {/* Sent to another office after delivery: the next stages wait, nobody's time is held. */}
                <ExternalWait value={taskOf(s.key).externalHours} onChange={(externalHours) => setTask(s.key, { externalHours })} t={t} />
              </div>
            )}
          />
        </div>
      )}
      <p className="text-xs text-white/60">{t("erp.projects.mainDepartmentHint")}</p>
      <p className="text-xs text-white/60">{t("erp.projects.datesByGantt")}</p>
      {mode === "propose" && <p className="text-xs text-amber-200/80">{t("erp.projects.proposeNote")}</p>}
      <p className="text-xs text-white/60">{t("erp.plan.scheduleNote")}</p>
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button onClick={save} disabled={saving || !form.templateId || !tasksReady}>
          {t(mode === "propose" ? "erp.projects.propose" : "erp.projects.acceptStart")}
        </Button>
      </div>
    </div>
  );
}

// "After delivery it goes to another office for review": how many working hours the
// stages after it wait. Folded away until it's used.
function ExternalWait({ value, onChange, t }) {
  const [open, setOpen] = useState(Number(value) > 0);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-xs text-violet-300/80 hover:text-violet-200">
        <Building2 size={13} /> + {t("erp.external.label")}
      </button>
    );
  }
  return (
    <div className="rounded-lg border border-violet-400/25 bg-violet-400/[0.06] p-2.5">
      <div className="grid items-end gap-2 sm:grid-cols-[180px_1fr]">
        <Input type="number" min="0" max="2000" step="0.5" label={t("erp.external.hours")} value={value ?? ""} onChange={onChange} dir="ltr" />
        <p className="pb-1 text-[11px] leading-relaxed text-white/50">{t("erp.external.formHint")}</p>
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
      <p className="mt-1 text-[11px] text-white/60">{legacy && !value ? t("erp.projects.legacyClient", { name: legacy }) : t("erp.projects.customerHint")}</p>
    </div>
  );
}
