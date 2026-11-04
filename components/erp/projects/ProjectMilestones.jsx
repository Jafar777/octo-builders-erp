"use client";

import { useState } from "react";
import { CheckCircle2, Circle, FileText, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { Button, ErrorText, Input } from "@/components/erp/ui/fields";
import { DependencyPicker } from "@/components/erp/tasks/TaskPlanning";

const toDay = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");

// A project's milestones on the Gantt (client delivery, permit, design approval…): their
// date, the tasks they wait for, and — for invoices.manage — the share of the contract
// to bill when each is reached. Marking one reached drafts its invoice.
export default function ProjectMilestones({ projectId, milestones, canBill, onChanged }) {
  const { t } = useLanguage();
  const [list, setList] = useState(milestones);
  const [adding, setAdding] = useState({ name: "", date: "", billPercent: "", billAmount: "", dependsOn: [] });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);

  async function call(method, body, key) {
    setBusy(key);
    setError("");
    try {
      const url = method === "DELETE" ? `/api/work-projects/${projectId}/milestones?milestoneId=${body.milestoneId}` : `/api/work-projects/${projectId}/milestones`;
      const res = await api(url, { method, body: method === "DELETE" ? undefined : body });
      setList(res.milestones);
      onChanged?.(res.milestones);
      return true;
    } catch (err) {
      setError(errorText(t, err));
      return false;
    } finally {
      setBusy(null);
    }
  }

  const patch = (m, fields) => call("PATCH", { milestoneId: m.id, ...fields }, m.id);
  const billing = (m) => (canBill ? { billPercent: Number(m.billPercent) || 0, billAmount: Number(m.billAmount) || 0 } : {});

  return (
    <div className="space-y-4">
      <p className="text-xs text-white/60">{t(canBill ? "erp.milestones.hintBilling" : "erp.milestones.hint")}</p>
      <ErrorText>{error}</ErrorText>
      <ul className="space-y-3">
        {list.map((m) => (
          <MilestoneRow key={m.id} m={m} projectId={projectId} canBill={canBill} busy={busy === m.id} onSave={(f) => patch(m, { ...f, ...(canBill ? billing(f) : {}) })} onToggle={() => patch(m, { done: !m.doneAt })} onDelete={() => call("DELETE", { milestoneId: m.id }, m.id)} />
        ))}
      </ul>

      <div className="space-y-3 rounded-2xl border border-dashed border-white/15 p-4">
        <p className="text-sm font-semibold">{t("erp.milestones.add")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label={t("erp.milestones.name")} value={adding.name} onChange={(v) => setAdding((a) => ({ ...a, name: v }))} />
          <Input label={t("erp.milestones.date")} type="date" value={adding.date} onChange={(v) => setAdding((a) => ({ ...a, date: v }))} />
          {canBill && (
            <>
              <Input label={t("erp.milestones.billPercent")} type="number" value={adding.billPercent} onChange={(v) => setAdding((a) => ({ ...a, billPercent: v }))} dir="ltr" />
              <Input label={t("erp.milestones.billAmount")} type="number" value={adding.billAmount} onChange={(v) => setAdding((a) => ({ ...a, billAmount: v }))} dir="ltr" />
            </>
          )}
        </div>
        <DependencyPicker value={adding.dependsOn} onChange={(dependsOn) => setAdding((a) => ({ ...a, dependsOn }))} projectId={projectId} />
        <div className="flex justify-end">
          <Button
            loading={busy === "new"}
            disabled={!adding.name || !adding.date}
            onClick={async () => {
              const ok = await call("POST", { name: adding.name, date: adding.date, dependsOn: adding.dependsOn, ...billing(adding) }, "new");
              if (ok) setAdding({ name: "", date: "", billPercent: "", billAmount: "", dependsOn: [] });
            }}
          >
            <Plus size={15} /> {t("erp.milestones.add")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function MilestoneRow({ m, projectId, canBill, busy, onSave, onToggle, onDelete }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({ name: m.name, date: toDay(m.date), billPercent: m.billPercent || "", billAmount: m.billAmount || "", dependsOn: m.dependsOn || [] });
  const [open, setOpen] = useState(false);
  const billed = m.billPercent > 0 || m.billAmount > 0;
  return (
    <li className="rounded-2xl border border-white/10 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onToggle} disabled={busy} title={t(m.doneAt ? "erp.milestones.reopen" : "erp.milestones.reached")} className={m.doneAt ? "text-emerald-300" : "text-white/60 hover:text-white"}>
          {m.doneAt ? <CheckCircle2 size={18} /> : <Circle size={18} />}
        </button>
        <button type="button" onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 text-start">
          <span className={`block truncate text-sm font-medium ${m.doneAt ? "text-white/50 line-through" : ""}`}>{m.name}</span>
          <span className="text-xs text-white/60">
            {toDay(m.date)}
            {billed && ` · ${m.billAmount > 0 ? m.billAmount : `${m.billPercent}%`} ${t("erp.milestones.billed")}`}
          </span>
        </button>
        {m.invoice && (
          <span className="flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] text-sky-300">
            <FileText size={11} /> {t("erp.milestones.invoiced")}
          </span>
        )}
        <button type="button" aria-label={t("common.delete")} onClick={onDelete} disabled={busy} className="text-white/55 hover:text-red-300">
          <Trash2 size={14} />
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={t("erp.milestones.name")} value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
            <Input label={t("erp.milestones.date")} type="date" value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
            {canBill && (
              <>
                <Input label={t("erp.milestones.billPercent")} type="number" value={form.billPercent} onChange={(v) => setForm((f) => ({ ...f, billPercent: v }))} dir="ltr" />
                <Input label={t("erp.milestones.billAmount")} type="number" value={form.billAmount} onChange={(v) => setForm((f) => ({ ...f, billAmount: v }))} dir="ltr" />
              </>
            )}
          </div>
          <DependencyPicker value={form.dependsOn} onChange={(dependsOn) => setForm((f) => ({ ...f, dependsOn }))} projectId={projectId} />
          <div className="flex justify-end">
            <Button loading={busy} onClick={() => onSave(form)}>
              {t("common.save")}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
