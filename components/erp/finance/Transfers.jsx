"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeftRight, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import Modal from "@/components/erp/ui/Modal";
import { Button, ErrorText, Input, Select } from "@/components/erp/ui/fields";
import { money } from "@/components/erp/hr/hrUi";
import { SkeletonList } from "@/components/erp/ui/Loading";

// Today on this device's clock (not UTC: after midnight here, UTC can still be yesterday).
const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

function MoneyFields({ form, setForm, currencies, prefix = "" }) {
  const { t, lang } = useLanguage();
  const rateFor = (code) => currencies.list.find((c) => c.code === code)?.rate || 1;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Input type="number" step="0.01" label={t(`erp.finance.${prefix}amount`)} value={form.amount} onChange={(amount) => setForm((f) => ({ ...f, amount }))} dir="ltr" />
      <Select
        label={t("erp.org.currency")}
        value={form.currency}
        onChange={(currency) => setForm((f) => ({ ...f, currency, rate: rateFor(currency) }))}
        options={currencies.list.map((c) => ({ value: c.code, label: `${c.code} — ${c.name?.[lang]}` }))}
      />
      {form.currency !== currencies.base && (
        <Input type="number" step="0.0001" label={t("erp.finance.rateLabel", { base: currencies.base })} value={form.rate} onChange={(rate) => setForm((f) => ({ ...f, rate }))} dir="ltr" />
      )}
    </div>
  );
}

export default function Transfers({ lookups, canManage, onChanged }) {
  const { t, lang } = useLanguage();
  const currencies = lookups.settings.currencies;
  const [list, setList] = useState(null);
  const [creating, setCreating] = useState(false);
  const [receiving, setReceiving] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => api("/api/finance/transfers").then((d) => setList(d.transfers)).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load]);

  function startNew() {
    const jed = lookups.branches.find((b) => b.code === "JED") || lookups.branches[0];
    const dam = lookups.branches.find((b) => b.code === "DAM") || lookups.branches[1];
    setForm({ fromBranch: jed?.id || "", toBranch: dam?.id || "", date: today(), method: "", amount: "", currency: jed?.currency || currencies.base, rate: currencies.list.find((c) => c.code === jed?.currency)?.rate || 1, note: "" });
    setError("");
    setCreating(true);
  }
  function startReceive(tr) {
    const to = lookups.branches.find((b) => b.id === tr.toBranch);
    const cur = to?.currency || currencies.base;
    setForm({ amount: "", currency: cur, rate: currencies.list.find((c) => c.code === cur)?.rate || 1, receivedAt: today() });
    setError("");
    setReceiving(tr);
  }

  async function submit() {
    setError("");
    try {
      const body = { ...form, amount: Number(form.amount), rate: Number(form.rate) };
      if (receiving) await api(`/api/finance/transfers/${receiving.id}`, { method: "PATCH", body });
      else await api("/api/finance/transfers", { method: "POST", body });
      setCreating(false);
      setReceiving(null);
      load();
      onChanged();
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  async function remove(tr) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    await api(`/api/finance/transfers/${tr.id}`, { method: "DELETE" }).catch(() => {});
    load();
    onChanged();
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <Button onClick={startNew}>
          <Plus size={16} /> {t("erp.finance.newTransfer")}
        </Button>
      )}
      {!list && <SkeletonList rows={4} />}
      <div className="space-y-2">
        {(list || []).map((tr) => (
          <div key={tr.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
            <span className="text-white/60" dir="ltr">{tr.date}</span>
            <span className="flex items-center gap-2 font-medium">
              {lookups.branchName(tr.fromBranch)} <ArrowLeftRight size={14} className="text-white/40" /> {lookups.branchName(tr.toBranch)}
            </span>
            <span className="tabular-nums">{money(tr.amountSent, tr.currencySent, lang)}</span>
            {tr.method && <span className="text-white/50">{tr.method}</span>}
            {tr.status === "received" ? (
              <span className="flex items-center gap-1.5 text-emerald-300">
                <CheckCircle2 size={14} /> {t("erp.finance.received")} {money(tr.amountReceived, tr.currencyReceived, lang)}
                <span className="text-xs text-white/45">({t("erp.finance.cost")}: {money(tr.cost, lookups.base, lang)})</span>
              </span>
            ) : (
              <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs text-amber-300">{t("erp.finance.inTransit")}</span>
            )}
            {canManage && (
              <span className="ms-auto flex gap-2">
                {tr.status === "sent" && <Button variant="ghost" onClick={() => startReceive(tr)}>{t("erp.finance.markReceived")}</Button>}
                <button type="button" onClick={() => remove(tr)} className="text-red-400" aria-label={t("common.delete")}><Trash2 size={15} /></button>
              </span>
            )}
          </div>
        ))}
        {list?.length === 0 && <p className="py-8 text-center text-white/40">{t("dashboard.noItems")}</p>}
      </div>

      <Modal open={creating || Boolean(receiving)} onClose={() => { setCreating(false); setReceiving(null); }} title={receiving ? t("erp.finance.markReceived") : t("erp.finance.newTransfer")}>
        {form && (
          <div className="space-y-4">
            {creating && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Select label={t("erp.finance.from")} value={form.fromBranch} onChange={(fromBranch) => setForm((f) => ({ ...f, fromBranch }))} options={lookups.branches.map((b) => ({ value: b.id, label: b.name?.[lang] }))} />
                <Select label={t("erp.finance.to")} value={form.toBranch} onChange={(toBranch) => setForm((f) => ({ ...f, toBranch }))} options={lookups.branches.map((b) => ({ value: b.id, label: b.name?.[lang] }))} />
                <Input type="date" label={t("erp.settings.date")} value={form.date} onChange={(date) => setForm((f) => ({ ...f, date }))} />
                <Input label={t("erp.finance.method")} value={form.method} onChange={(method) => setForm((f) => ({ ...f, method }))} />
              </div>
            )}
            {receiving && <Input type="date" label={t("erp.finance.receivedAt")} value={form.receivedAt} onChange={(receivedAt) => setForm((f) => ({ ...f, receivedAt }))} />}
            <MoneyFields form={form} setForm={setForm} currencies={currencies} prefix={receiving ? "received_" : "sent_"} />
            <ErrorText>{error}</ErrorText>
            <Button onClick={submit} disabled={form.amount === ""}>{t("common.save")}</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
