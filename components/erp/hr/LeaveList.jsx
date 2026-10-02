"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { Button, ErrorText, Input, Label, Select } from "@/components/erp/ui/fields";

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
      <p className="text-xs text-white/40">{t("erp.hr.leaveApproverNote")}</p>
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>{t("common.cancel")}</Button>
        <Button onClick={save} disabled={!form.from || !form.to}>{t("erp.hr.sendRequest")}</Button>
      </div>
    </div>
  );
}

// List of leave requests; `approver` shows approve / reject, otherwise own cancel.
export default function LeaveList({ leaves, approver = false, onChanged }) {
  const { t } = useLanguage();
  const [error, setError] = useState("");

  async function decide(id, decision) {
    setError("");
    const note = decision === "reject" ? window.prompt(t("erp.hr.rejectReason")) ?? "" : "";
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
      {leaves.map((l) => (
        <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
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
          {l.status === "pending" && approver && (
            <>
              <Button onClick={() => decide(l.id, "approve")}>{t("erp.tasks.approve")}</Button>
              <Button variant="danger" onClick={() => decide(l.id, "reject")}>{t("erp.tasks.reject")}</Button>
            </>
          )}
          {l.status === "pending" && !approver && (
            <Button variant="ghost" onClick={() => decide(l.id, "cancel")}>{t("common.cancel")}</Button>
          )}
        </div>
      ))}
      {leaves.length === 0 && <p className="py-6 text-center text-sm text-white/40">{t("erp.hr.noLeave")}</p>}
    </div>
  );
}
