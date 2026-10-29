"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Banknote, ExternalLink, FilePlus2, FolderPlus, Pencil, Plus, RotateCcw, Trash2, XCircle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDate, formatDateTime } from "@/lib/formatTime";
import { DOC_KEYS, INTAKE_PRIORITIES, PROJECT_TYPES, REQUIREMENT_KEYS, SCOPE_KEYS } from "@/lib/intakeRules";
import Modal from "@/components/erp/ui/Modal";
import { Button, Card, ErrorText, Input, Label, PageHeader, Select } from "@/components/erp/ui/fields";
import { SkeletonList } from "@/components/erp/ui/Loading";
import ProjectForm from "@/components/erp/projects/ProjectForm";
import { useTaskLookups } from "@/components/erp/tasks/useTaskLookups";
import { useFinanceLookups } from "@/components/erp/finance/useFinanceLookups";

const TABS = ["all", "new", "ready", "converted", "declined"];
const STATUS_TONE = {
  new: "bg-amber-500/15 text-amber-200",
  ready: "bg-sky-500/15 text-sky-200",
  converted: "bg-emerald-500/15 text-emerald-200",
  declined: "bg-white/10 text-white/50",
};

const EMPTY = {
  client: { name: "", number: "", contactMethod: "", phone: "", receivedAt: "", requiredDelivery: "" },
  project: { name: "", location: "", area: "", expectedDelivery: "", types: [], priority: "normal" },
  requirements: Object.fromEntries(REQUIREMENT_KEYS.map((k) => [k, ""])),
  documents: [],
  documentsOther: "",
  scope: [],
  summary: "",
  missing: [],
};

function StatusBadge({ status }) {
  const { t } = useLanguage();
  return <span className={`rounded-full px-2.5 py-0.5 text-xs ${STATUS_TONE[status] || ""}`}>{t(`erp.intake.status.${status}`)}</span>;
}

// The new-project intake forms: the secretary fills them in, the GM / CEO add the money
// side and turn them into projects. `planner` = GM / CEO; `finance` = may see money.
export default function IntakeCenter({ planner, finance }) {
  const { t, lang } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(planner ? "new" : "all");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(searchParams.get("intake"));
  const [editing, setEditing] = useState(null); // null | "new" | intake
  const [converting, setConverting] = useState(null);

  const load = useCallback(() => {
    api(`/api/intakes${tab === "all" ? "" : `?status=${tab}`}`)
      .then(setData)
      .catch((err) => setError(errorText(t, err)));
  }, [tab, t]);
  useEffect(() => {
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  const open = (id) => {
    setOpenId(id);
    router.replace(id ? `/dashboard/intake?intake=${id}` : "/dashboard/intake", { scroll: false });
  };

  return (
    <div className="max-w-6xl">
      <PageHeader
        title={t("erp.nav.intake")}
        subtitle={t(planner ? "erp.intake.subtitlePlanner" : "erp.intake.subtitle")}
        actions={
          <Button onClick={() => setEditing("new")}>
            <FilePlus2 size={16} /> {t("erp.intake.new")}
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap gap-1 rounded-xl border border-white/10 p-1">
        {TABS.map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => setTab(x)}
            className={`rounded-lg px-4 py-2 text-sm ${tab === x ? "bg-brand-orange text-white" : "text-white/60 hover:text-white"}`}
          >
            {t(`erp.intake.tab.${x}`)}
            {x !== "all" && data?.counts?.[x] ? ` (${data.counts[x]})` : ""}
          </button>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
      {!data && !error && <SkeletonList rows={5} />}
      {data && (
        <div className="space-y-2">
          {data.intakes.map((i) => (
            <button key={i.id} type="button" onClick={() => open(i.id)} className="flex w-full flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-start hover:bg-white/[0.06]">
              <span className="text-xs text-white/40" dir="ltr">
                #{i.number}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium" dir="auto">
                  {i.project.name}
                </span>
                <span className="block text-xs text-white/45" dir="auto">
                  {[i.client.name, i.createdBy, formatDateTime(i.createdAt, lang)].filter(Boolean).join(" · ")}
                </span>
              </span>
              {planner && finance && i.status === "new" && <span className="text-xs text-amber-200">{t("erp.intake.needsPricing")}</span>}
              <StatusBadge status={i.status} />
            </button>
          ))}
          {data.intakes.length === 0 && <p className="py-10 text-center text-white/40">{t("erp.intake.empty")}</p>}
        </div>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === "new" ? t("erp.intake.new") : t("erp.intake.edit")} wide>
        {editing && (
          <IntakeForm
            intake={editing === "new" ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={(saved) => {
              setEditing(null);
              load();
              open(saved.id);
            }}
          />
        )}
      </Modal>

      <IntakeDetail
        id={openId}
        planner={planner}
        finance={finance}
        onClose={() => open(null)}
        onChanged={load}
        onEdit={(intake) => setEditing(intake)}
        onConvert={(intake) => setConverting(intake)}
      />

      <Modal open={Boolean(converting)} onClose={() => setConverting(null)} title={t("erp.intake.createProject")} wide>
        {converting && (
          <ConvertProject
            intake={converting}
            onCancel={() => setConverting(null)}
            onCreated={(project) => {
              setConverting(null);
              router.push(`/dashboard/projects/${project.id}`);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function ConvertProject({ intake, onCancel, onCreated }) {
  const lookups = useTaskLookups();
  return <ProjectForm lookups={lookups} intake={intake} onCancel={onCancel} onCreated={onCreated} />;
}

// ---------- the form (the secretary's part — never money) ----------

function Checks({ keys, group, value, onChange }) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {keys.map((k) => (
        <label key={k} className="flex cursor-pointer items-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-orange"
            checked={value.includes(k)}
            onChange={(e) => onChange(e.target.checked ? [...value, k] : value.filter((x) => x !== k))}
          />
          {t(`erp.intake.${group}.${k}`)}
        </label>
      ))}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="rounded-2xl border border-white/10">
      <p className="rounded-t-2xl bg-white/[0.06] px-4 py-2.5 text-sm font-semibold">{title}</p>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

function IntakeForm({ intake, onSaved, onCancel }) {
  const { t } = useLanguage();
  const [form, setForm] = useState(() =>
    intake
      ? {
          client: { ...EMPTY.client, ...intake.client },
          project: { ...EMPTY.project, ...intake.project },
          requirements: { ...EMPTY.requirements, ...intake.requirements },
          documents: intake.documents,
          documentsOther: intake.documentsOther,
          scope: intake.scope,
          summary: intake.summary,
          missing: intake.missing,
        }
      : EMPTY
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const setIn = (group, key) => (value) => setForm((f) => ({ ...f, [group]: { ...f[group], [key]: value } }));
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const setMissing = (i, patch) => setForm((f) => ({ ...f, missing: f.missing.map((m, j) => (j === i ? { ...m, ...patch } : m)) }));

  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = intake
        ? await api(`/api/intakes/${intake.id}`, { method: "PATCH", body: form })
        : await api("/api/intakes", { method: "POST", body: form });
      onSaved(res.intake);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  const area = (value, onChange) => (
    <textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/30" />
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title={t("erp.intake.section.client")}>
          <Input label={`${t("erp.intake.field.clientName")} *`} value={form.client.name} onChange={setIn("client", "name")} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={t("erp.intake.field.clientNumber")} value={form.client.number} onChange={setIn("client", "number")} />
            <Input label={t("erp.intake.field.phone")} value={form.client.phone} onChange={setIn("client", "phone")} dir="ltr" />
          </div>
          <Input label={t("erp.intake.field.contactMethod")} value={form.client.contactMethod} onChange={setIn("client", "contactMethod")} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input type="date" label={t("erp.intake.field.receivedAt")} value={form.client.receivedAt} onChange={setIn("client", "receivedAt")} />
            <Input type="date" label={t("erp.intake.field.requiredDelivery")} value={form.client.requiredDelivery} onChange={setIn("client", "requiredDelivery")} />
          </div>
        </Section>
        <Section title={t("erp.intake.section.project")}>
          <Input label={`${t("erp.intake.field.projectName")} *`} value={form.project.name} onChange={setIn("project", "name")} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={t("erp.intake.field.location")} value={form.project.location} onChange={setIn("project", "location")} />
            <Input label={t("erp.intake.field.area")} value={form.project.area} onChange={setIn("project", "area")} />
          </div>
          <Input type="date" label={t("erp.intake.field.expectedDelivery")} value={form.project.expectedDelivery} onChange={setIn("project", "expectedDelivery")} />
          <div>
            <Label>{t("erp.intake.field.types")}</Label>
            <Checks keys={PROJECT_TYPES} group="type" value={form.project.types} onChange={setIn("project", "types")} />
          </div>
          <Select
            label={t("erp.intake.field.priority")}
            value={form.project.priority}
            onChange={setIn("project", "priority")}
            options={INTAKE_PRIORITIES.map((p) => ({ value: p, label: t(`erp.intake.priority.${p}`) }))}
          />
        </Section>
      </div>

      <Section title={t("erp.intake.section.requirements")}>
        <div className="grid gap-3 sm:grid-cols-2">
          {REQUIREMENT_KEYS.map((k) => (
            <div key={k}>
              <Label>{t(`erp.intake.req.${k}`)}</Label>
              {area(form.requirements[k], setIn("requirements", k))}
            </div>
          ))}
        </div>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title={t("erp.intake.section.documents")}>
          <Checks keys={DOC_KEYS} group="doc" value={form.documents} onChange={set("documents")} />
          {form.documents.includes("other") && <Input label={t("erp.intake.field.documentsOther")} value={form.documentsOther} onChange={set("documentsOther")} />}
        </Section>
        <Section title={t("erp.intake.section.scope")}>
          <Checks keys={SCOPE_KEYS} group="scope" value={form.scope} onChange={set("scope")} />
        </Section>
      </div>

      <Section title={t("erp.intake.section.summary")}>
        <textarea rows={4} value={form.summary} onChange={(e) => set("summary")(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/30" />
      </Section>

      <Section title={t("erp.intake.section.missing")}>
        {form.missing.map((m, i) => (
          <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <Input label={t("erp.intake.field.missingItem")} value={m.item} onChange={(item) => setMissing(i, { item })} />
            <Input label={t("erp.intake.field.missingResponsible")} value={m.responsible} onChange={(responsible) => setMissing(i, { responsible })} />
            <Input label={t("erp.intake.field.missingStatus")} value={m.status} onChange={(status) => setMissing(i, { status })} />
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, missing: f.missing.filter((_, j) => j !== i) }))}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-500/30 text-red-400"
              aria-label={t("common.delete")}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <Button variant="ghost" onClick={() => setForm((f) => ({ ...f, missing: [...f.missing, { item: "", responsible: "", status: "" }] }))}>
          <Plus size={15} /> {t("erp.intake.addMissing")}
        </Button>
      </Section>

      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button onClick={save} loading={busy} disabled={!form.client.name.trim() || !form.project.name.trim()}>
          {t(intake ? "common.save" : "erp.intake.submit")}
        </Button>
      </div>
    </div>
  );
}

// ---------- one intake ----------

function Row({ label, children }) {
  if (!children || (Array.isArray(children) && !children.length)) return null;
  return (
    <div className="grid gap-1 border-b border-white/5 py-2 text-sm sm:grid-cols-[200px_1fr]">
      <span className="text-white/45">{label}</span>
      <span className="whitespace-pre-wrap text-white/85" dir="auto">
        {children}
      </span>
    </div>
  );
}

function IntakeDetail({ id, planner, finance, onClose, onChanged, onEdit, onConvert }) {
  const { t, lang } = useLanguage();
  const [intake, setIntake] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setError("");
    api(`/api/intakes/${id}`)
      .then((d) => setIntake(d.intake))
      .catch((err) => setError(errorText(t, err)));
  }, [id, t]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIntake(null);
    load();
  }, [load]);

  const changed = (next) => {
    setIntake(next);
    onChanged();
  };

  async function decide(action) {
    const reason = action === "decline" ? window.prompt(t("erp.intake.declineReason")) : "";
    if (action === "decline" && !reason?.trim()) return;
    setBusy(true);
    setError("");
    try {
      changed((await api(`/api/intakes/${id}/decision`, { method: "POST", body: { action, reason } })).intake);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(t("erp.intake.confirmDelete"))) return;
    try {
      await api(`/api/intakes/${id}`, { method: "DELETE" });
      onChanged();
      onClose();
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  const i = intake;
  const date = (v) => (v ? formatDate(v, lang) : "");
  return (
    <Modal open={Boolean(id)} onClose={onClose} title={i ? `#${i.number} · ${i.project.name}` : "…"} wide>
      {!i ? (
        error ? <ErrorText>{error}</ErrorText> : <SkeletonList rows={4} avatar={false} />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/50">
            <StatusBadge status={i.status} />
            <span>{t("erp.intake.by", { name: i.createdBy || "—", at: formatDateTime(i.createdAt, lang) })}</span>
          </div>
          {i.status === "declined" && i.declineReason && <p className="rounded-xl bg-white/5 px-4 py-3 text-sm text-white/70">{t("erp.intake.declinedBecause", { reason: i.declineReason })}</p>}
          {i.status === "converted" && i.projectId && (
            <Link href={`/dashboard/projects/${i.projectId}`} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-2.5 text-sm text-emerald-200 hover:bg-emerald-500/25">
              <ExternalLink size={15} /> {t("erp.intake.openProject")}
            </Link>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <p className="mb-2 font-semibold">{t("erp.intake.section.client")}</p>
              <Row label={t("erp.intake.field.clientName")}>{i.client.name}</Row>
              <Row label={t("erp.intake.field.clientNumber")}>{i.client.number}</Row>
              <Row label={t("erp.intake.field.contactMethod")}>{i.client.contactMethod}</Row>
              <Row label={t("erp.intake.field.phone")}>{i.client.phone}</Row>
              <Row label={t("erp.intake.field.receivedAt")}>{date(i.client.receivedAt)}</Row>
              <Row label={t("erp.intake.field.requiredDelivery")}>{date(i.client.requiredDelivery)}</Row>
            </Card>
            <Card>
              <p className="mb-2 font-semibold">{t("erp.intake.section.project")}</p>
              <Row label={t("erp.intake.field.projectName")}>{i.project.name}</Row>
              <Row label={t("erp.intake.field.location")}>{i.project.location}</Row>
              <Row label={t("erp.intake.field.area")}>{i.project.area}</Row>
              <Row label={t("erp.intake.field.expectedDelivery")}>{date(i.project.expectedDelivery)}</Row>
              <Row label={t("erp.intake.field.types")}>{i.project.types.map((k) => t(`erp.intake.type.${k}`)).join("، ")}</Row>
              <Row label={t("erp.intake.field.priority")}>{t(`erp.intake.priority.${i.project.priority}`)}</Row>
            </Card>
          </div>

          <Card>
            <p className="mb-2 font-semibold">{t("erp.intake.section.requirements")}</p>
            {REQUIREMENT_KEYS.map((k) => (
              <Row key={k} label={t(`erp.intake.req.${k}`)}>
                {i.requirements?.[k]}
              </Row>
            ))}
            <Row label={t("erp.intake.section.documents")}>{[...i.documents.map((k) => t(`erp.intake.doc.${k}`)), i.documentsOther].filter(Boolean).join("، ")}</Row>
            <Row label={t("erp.intake.section.scope")}>{i.scope.map((k) => t(`erp.intake.scope.${k}`)).join("، ")}</Row>
            <Row label={t("erp.intake.section.summary")}>{i.summary}</Row>
            {i.missing.length > 0 && (
              <Row label={t("erp.intake.section.missing")}>{i.missing.map((m) => [m.item, m.responsible, m.status].filter(Boolean).join(" — ")).join("\n")}</Row>
            )}
          </Card>

          {/* The money side: GM / CEO only (the server sends it to nobody else). */}
          {finance && ["new", "ready"].includes(i.status) && <FinanceSection intake={i} onSaved={changed} />}
          {finance && i.finance && !["new", "ready"].includes(i.status) && <FinanceSummary f={i.finance} />}
          {!finance && i.status === "new" && <p className="text-xs text-white/45">{t("erp.intake.waitingPricing")}</p>}

          <ErrorText>{error}</ErrorText>
          <div className="flex flex-wrap gap-2">
            {i.canEdit && (
              <Button variant="ghost" onClick={() => onEdit(i)}>
                <Pencil size={15} /> {t("erp.intake.edit")}
              </Button>
            )}
            {planner && finance && i.status === "ready" && (
              <Button onClick={() => onConvert(i)}>
                <FolderPlus size={15} /> {t("erp.intake.createProject")}
              </Button>
            )}
            {planner && ["new", "ready"].includes(i.status) && (
              <Button variant="danger" onClick={() => decide("decline")} disabled={busy}>
                <XCircle size={15} /> {t("erp.intake.decline")}
              </Button>
            )}
            {planner && i.status === "declined" && (
              <Button variant="ghost" onClick={() => decide("reopen")} disabled={busy}>
                <RotateCcw size={15} /> {t("erp.intake.reopen")}
              </Button>
            )}
            {i.canDelete && (
              <Button variant="ghost" onClick={remove}>
                <Trash2 size={15} /> {t("common.delete")}
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------- the money side (GM / CEO) ----------

function FinanceSummary({ f }) {
  const { t, lang } = useLanguage();
  const fin = useFinanceLookups();
  const n = (v) => (v === null || v === undefined ? "—" : Number(v).toLocaleString(lang === "ar" ? "ar" : "en"));
  return (
    <Card className="border-emerald-500/20">
      <p className="mb-2 flex items-center gap-2 font-semibold text-emerald-200">
        <Banknote size={16} /> {t("erp.intake.section.finance")}
      </p>
      <Row label={t("erp.intake.fin.contractValue")}>{`${n(f.contractValue)} ${f.currency}`}</Row>
      <Row label={t("erp.intake.fin.budget")}>{f.budget !== null ? `${n(f.budget)} ${fin.base}` : ""}</Row>
      <Row label={t("erp.intake.fin.branch")}>{f.branch ? fin.branchName(f.branch) : ""}</Row>
      <Row label={t("erp.intake.fin.client")}>{f.client ? fin.clientName(f.client) : ""}</Row>
      <Row label={t("erp.intake.fin.advancePaid")}>{f.advancePaid > 0 ? `${n(f.advancePaid)} ${f.currency} · ${formatDate(f.advanceDate, lang)}` : ""}</Row>
      <Row label={t("erp.intake.fin.paymentTerms")}>{f.paymentTerms}</Row>
      <Row label={t("erp.intake.fin.notes")}>{f.notes}</Row>
      {f.by && <p className="mt-2 text-[11px] text-white/40">{t("erp.intake.pricedBy", { name: f.by, at: formatDateTime(f.at, lang) })}</p>}
    </Card>
  );
}

function FinanceSection({ intake, onSaved }) {
  const { t, lang } = useLanguage();
  const fin = useFinanceLookups();
  const f = intake.finance;
  const [form, setForm] = useState(() => ({
    contractValue: f?.contractValue ?? "",
    currency: f?.currency || "",
    rate: f?.rate ?? "",
    budget: f?.budget ?? "",
    branch: f?.branch || "",
    client: f?.client || "",
    advancePaid: f?.advancePaid || "",
    advanceDate: f?.advanceDate || "",
    paymentTerms: f?.paymentTerms || "",
    notes: f?.notes || "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (v) => setForm((x) => ({ ...x, [k]: v }));
  const currencies = fin.settings?.currencies.list || [];
  const currency = form.currency || fin.base;

  async function save() {
    setBusy(true);
    setError("");
    try {
      const body = { ...form, currency, rate: form.rate === "" ? null : Number(form.rate), branch: form.branch || null, client: form.client || null };
      onSaved((await api(`/api/intakes/${intake.id}/finance`, { method: "PUT", body })).intake);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.04] p-4">
      <div>
        <p className="flex items-center gap-2 font-semibold text-emerald-200">
          <Banknote size={16} /> {t("erp.intake.section.finance")}
        </p>
        <p className="mt-1 text-xs text-white/50">{t("erp.intake.financeHint")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input type="number" min="0" label={`${t("erp.intake.fin.contractValue")} *`} value={form.contractValue} onChange={set("contractValue")} dir="ltr" />
        <Select label={t("erp.intake.fin.currency")} value={currency} onChange={set("currency")} options={currencies.map((c) => ({ value: c.code, label: `${c.code} · ${c.name?.[lang] || ""}` }))} />
        {currency !== fin.base && <Input type="number" min="0" step="0.0001" label={t("erp.intake.fin.rate", { base: fin.base })} value={form.rate} onChange={set("rate")} dir="ltr" placeholder={String(currencies.find((c) => c.code === currency)?.rate || "")} />}
        <Input type="number" min="0" label={t("erp.intake.fin.budgetIn", { base: fin.base })} value={form.budget} onChange={set("budget")} dir="ltr" />
        <Select label={t("erp.intake.fin.branch")} value={form.branch} onChange={set("branch")} placeholder="—" options={fin.branches.map((b) => ({ value: b.id, label: b.name?.[lang] }))} />
        <Select label={t("erp.intake.fin.client")} value={form.client} onChange={set("client")} placeholder={t("erp.intake.fin.newClient", { name: intake.client.name })} options={fin.clients.map((c) => ({ value: c.id, label: c.name }))} />
        <Input type="number" min="0" label={t("erp.intake.fin.advancePaid")} value={form.advancePaid} onChange={set("advancePaid")} dir="ltr" />
        {Number(form.advancePaid) > 0 && <Input type="date" label={t("erp.intake.fin.advanceDate")} value={form.advanceDate} onChange={set("advanceDate")} />}
      </div>
      <Input label={t("erp.intake.fin.paymentTerms")} value={form.paymentTerms} onChange={set("paymentTerms")} />
      <Input label={t("erp.intake.fin.notes")} value={form.notes} onChange={set("notes")} />
      <ErrorText>{error}</ErrorText>
      <Button onClick={save} loading={busy} disabled={form.contractValue === "" || !fin.settings}>
        {t(f ? "erp.intake.updateFinance" : "erp.intake.saveFinance")}
      </Button>
    </section>
  );
}
