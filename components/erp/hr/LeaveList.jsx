"use client";

import { useState } from "react";
import { Check, Clock, Minus, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { formatDate } from "@/lib/formatTime";
import { api, errorText } from "@/lib/clientApi";
import { Button, ErrorText, Input, Label, Select } from "@/components/erp/ui/fields";
import { useAsk, useToast } from "@/components/erp/ui/Feedback";
import { Checkbox, EmptyState, TableToolbar, useTableTools } from "@/components/erp/ui/DataTools";

const STATUS = {
  pending: "bg-brand-orange/15 text-brand-orange",
  approved: "bg-emerald-500/15 text-emerald-300",
  rejected: "bg-red-500/15 text-red-300",
  cancelled: "bg-white/10 text-white/50",
};

export function LeaveForm({ onCreated, onCancel }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({ type: "annual", from: "", to: "", reason: "" });
  const [error, setError] = useState("");
  const set = (f) => (v) => setForm((x) => ({ ...x, [f]: v }));

  async function save() {
    setError("");
    try {
      await api("/api/leave", { method: "POST", body: form });
      onCreated();
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  return (
    <div className="space-y-4">
      <Select label={t("erp.hr.leaveType")} value={form.type} onChange={set("type")} options={["annual", "sick", "unpaid"].map((x) => ({ value: x, label: t(`erp.hr.leave.${x}`) }))} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input type="date" label={t("erp.settings.from")} value={form.from} onChange={set("from")} />
        <Input type="date" label={t("erp.settings.to")} value={form.to} onChange={set("to")} />
      </div>
      <div>
        <Label>{t("erp.hr.reason")}</Label>
        <textarea rows={3} value={form.reason} onChange={(e) => set("reason")(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-white/30" />
      </div>
      <p className="text-xs text-white/60">{t("erp.hr.leaveApproverNote")}</p>
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>{t("common.cancel")}</Button>
        <Button onClick={save} disabled={!form.from || !form.to}>{t("erp.hr.sendRequest")}</Button>
      </div>
    </div>
  );
}

// Where a request is: department manager → HR / GM. Each step shows who decided.
function LeaveSteps({ leave }) {
  const { t, lang } = useLanguage();
  const steps = [];
  // A request still on (or stopped at) the manager step keeps stage "manager".
  const atManager = leave.stage === "manager";
  if (atManager || leave.manager) {
    steps.push(
      !atManager
        ? { key: "manager", state: "done", who: leave.manager.name, at: leave.manager.at }
        : leave.status === "rejected"
          ? { key: "manager", state: "rejected", who: leave.manager?.name, at: leave.manager?.at }
          : { key: "manager", state: "current" }
    );
  }
  if (atManager) {
    // Not with HR / GM yet — or never sent, when the manager rejected it.
    steps.push({ key: "final", state: leave.status === "pending" ? "waiting" : "skipped" });
  } else if (leave.status === "pending") {
    steps.push({ key: "final", state: "current" });
  } else {
    steps.push({ key: "final", state: leave.status === "approved" ? "done" : "rejected", who: leave.decidedBy, at: leave.decidedAt });
  }

  const STYLE = {
    done: { dot: "bg-emerald-400 text-brand-navy", Icon: Check, text: "text-emerald-300" },
    rejected: { dot: "bg-red-400 text-brand-navy", Icon: X, text: "text-red-300" },
    current: { dot: "bg-brand-orange text-brand-navy", Icon: Clock, text: "text-brand-orange" },
    waiting: { dot: "bg-white/10 text-white/60", Icon: Clock, text: "text-white/60" },
    skipped: { dot: "bg-white/5 text-white/60", Icon: Minus, text: "text-white/50" },
  };

  return (
    <div className="flex basis-full flex-wrap items-center gap-2 text-xs">
      {steps.map((s, i) => {
        const st = STYLE[s.state];
        return (
          <span key={s.key} className="flex items-center gap-2">
            {i > 0 && <span className="h-px w-6 bg-white/15" />}
            <span className={`flex h-5 w-5 items-center justify-center rounded-full ${st.dot}`}>
              <st.Icon size={12} strokeWidth={3} />
            </span>
            <span className={st.text}>
              {t(`erp.leaveFlow.step.${s.key}`)}
              <span className="text-white/60">
                {" · "}
                {s.who ? `${s.who}${s.at ? ` (${formatDate(s.at, lang)})` : ""}` : t(`erp.leaveFlow.state.${s.state}`)}
              </span>
            </span>
          </span>
        );
      })}
    </div>
  );
}

// List of leave requests. Approve / reject show on requests the viewer decides now;
// otherwise (own requests) cancel while pending.
export default function LeaveList({ leaves, approver = false, onChanged, empty }) {
  const { t } = useLanguage();
  const ask = useAsk();
  const toast = useToast();
  const [error, setError] = useState("");
  // Managers: tick several requests and approve them in one go.
  const decidable = leaves.filter((l) => l.canDecide);
  const tools = useTableTools(decidable);
  const bulk = approver && decidable.length > 1;
  async function approveMany(rows) {
    let done = 0;
    for (const l of rows) {
      try {
        await api(`/api/leave/${l.id}`, { method: "PATCH", body: { decision: "approve", note: "" }, quiet: true });
        done += 1;
      } catch {}
    }
    toast({ text: t("erp.ux.bulkDone", { n: done, total: rows.length }), tone: done === rows.length ? "success" : "error" });
    onChanged();
  }

  async function decide(id, decision) {
    setError("");
    const note = decision === "reject" ? await ask({ text: t("erp.hr.rejectReason"), danger: true }) : "";
    if (note === null) return;
    try {
      await api(`/api/leave/${id}`, { method: "PATCH", body: { decision, note } });
      onChanged();
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  return (
    <div className="space-y-2">
      <ErrorText>{error}</ErrorText>
      {bulk && (
        <TableToolbar tools={tools} actions={[{ label: t("erp.ux.approveSelected"), onClick: approveMany }]}>
          {!tools.someOn && (
            <button type="button" onClick={tools.toggleAll} className="text-sm text-white/70 hover:text-white">
              {t("erp.ux.selectPending", { n: decidable.length })}
            </button>
          )}
        </TableToolbar>
      )}
      {leaves.map((l) => (
        <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
          {bulk && (l.canDecide ? <Checkbox checked={tools.selected.has(l.id)} onChange={() => tools.toggle(l.id)} label={l.userName} /> : <span className="w-5" />)}
          {approver && <span className="font-medium">{l.userName}</span>}
          <span>{t(`erp.hr.leave.${l.type}`)}</span>
          <span className="text-white/60" dir="ltr">
            {l.from} → {l.to}
          </span>
          <span className="text-white/50">
            {l.days} {t("erp.hr.days")}
          </span>
          {l.reason && <span className="min-w-0 flex-1 truncate text-white/50">{l.reason}</span>}
          <span className={`ms-auto rounded-full px-2.5 py-0.5 text-xs ${STATUS[l.status]}`}>{t(`erp.hr.leaveStatus.${l.status}`)}</span>
          {l.canDecide && (
            <>
              <Button onClick={() => decide(l.id, "approve")}>
                {t(l.stage === "manager" ? "erp.leaveFlow.approveForward" : "erp.tasks.approve")}
              </Button>
              <Button variant="danger" onClick={() => decide(l.id, "reject")}>{t("erp.tasks.reject")}</Button>
            </>
          )}
          {l.status === "pending" && !approver && (
            <Button variant="ghost" onClick={() => decide(l.id, "cancel")}>{t("common.cancel")}</Button>
          )}
          {l.status !== "cancelled" && <LeaveSteps leave={l} />}
          {(l.manager?.note || l.decisionNote) && (
            <p className="basis-full text-xs text-white/60">{[l.manager?.note, l.decisionNote !== l.manager?.note ? l.decisionNote : ""].filter(Boolean).join(" · ")}</p>
          )}
        </div>
      ))}
      {leaves.length === 0 && <EmptyState compact text={empty || t("erp.hr.noLeave")} />}
    </div>
  );
}
