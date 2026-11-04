"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Plus, Trash2, XCircle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatMoney } from "@/components/erp/intake/MoneyFields";
import Modal from "@/components/erp/ui/Modal";
import { Button, Card, ErrorText, Input, Select } from "@/components/erp/ui/fields";
import { useConfirm } from "@/components/erp/ui/Feedback";

// The accounts: profit and loss, balance sheet, trial balance and each account's lines,
// all posted automatically; plus manual entries (opening balances, owner's money, loans).
export default function Books({ lookups, canManage }) {
  const { t, lang } = useLanguage();
  const confirm = useConfirm();
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [branch, setBranch] = useState("");
  const [account, setAccount] = useState("");
  const [data, setData] = useState(null);
  const [journals, setJournals] = useState([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    const q = new URLSearchParams({ from, to, ...(branch ? { branch } : {}), ...(account ? { account } : {}) });
    api(`/api/finance/books?${q}`).then(setData).catch((err) => setError(errorText(t, err)));
    api("/api/finance/journals").then((d) => setJournals(d.journals)).catch(() => {});
  }, [from, to, branch, account, t]);
  useEffect(() => {
    load();
  }, [load]);

  const base = data?.base;
  const name = (k) => t(`erp.books.account.${k}`);
  const money = (v) => formatMoney(v, base, lang);
  const row = (label, value, strong = false, onClick = null) => (
    <div className={`flex items-center justify-between gap-3 py-1.5 text-sm ${strong ? "border-t border-white/10 pt-2 font-semibold" : ""}`}>
      {onClick ? (
        <button type="button" onClick={onClick} className="text-start text-white/80 hover:text-brand-orange hover:underline">
          {label}
        </button>
      ) : (
        <span className={strong ? "" : "text-white/80"}>{label}</span>
      )}
      <span className="tabular-nums">{money(value)}</span>
    </div>
  );

  async function removeJournal(id) {
    if (!(await confirm({ text: t("common.confirmDelete"), kind: "delete" }))) return;
    await api(`/api/finance/journals/${id}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <Input label={t("erp.books.from")} type="date" value={from} onChange={setFrom} />
        <Input label={t("erp.books.to")} type="date" value={to} onChange={setTo} />
        <Select label={t("erp.invoices.branch")} value={branch} onChange={setBranch} placeholder={t("erp.books.allBranches")} options={lookups.branches.map((b) => ({ value: b.id, label: b.name?.[lang] }))} />
        <div className="flex items-end">
          {canManage && (
            <Button variant="ghost" onClick={() => setAdding(true)}>
              <Plus size={15} /> {t("erp.books.addJournal")}
            </Button>
          )}
        </div>
      </div>
      <ErrorText>{error}</ErrorText>

      {data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <p className="mb-2 font-semibold">{t("erp.books.pnl")}</p>
            <p className="mb-1 text-xs uppercase tracking-wider text-white/55">{t("erp.books.income")}</p>
            {data.pnl.income.map((x) => row(name(x.account), x.amount, false, () => setAccount(x.account)))}
            <p className="mb-1 mt-3 text-xs uppercase tracking-wider text-white/55">{t("erp.books.expenses")}</p>
            {data.pnl.expenses.map((x) => row(name(x.account), x.amount, false, () => setAccount(x.account)))}
            {row(t("erp.books.net"), data.pnl.net, true)}
          </Card>
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <p className="font-semibold">{t("erp.books.balanceSheet", { date: data.to })}</p>
              {data.balanceSheet.balanced ? <CheckCircle2 size={16} className="text-emerald-300" /> : <XCircle size={16} className="text-red-300" />}
            </div>
            <p className="mb-1 text-xs uppercase tracking-wider text-white/55">{t("erp.books.assets")}</p>
            {data.balanceSheet.assets.map((x) => row(name(x.account), x.amount, false, () => setAccount(x.account)))}
            {row(t("erp.books.totalAssets"), data.balanceSheet.totalAssets, true)}
            <p className="mb-1 mt-3 text-xs uppercase tracking-wider text-white/55">{t("erp.books.liabilitiesEquity")}</p>
            {[...data.balanceSheet.liabilities, ...data.balanceSheet.equity].map((x) =>
              row(name(x.account), x.amount, false, x.account === "retained_earnings" ? null : () => setAccount(x.account))
            )}
            {row(t("erp.books.totalLiabilitiesEquity"), data.balanceSheet.totalLiabilities + data.balanceSheet.totalEquity, true)}
          </Card>
        </div>
      )}

      {data?.ledger && (
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <p className="font-semibold">{name(data.ledger.account)}</p>
            <button type="button" onClick={() => setAccount("")} className="text-xs text-white/50 hover:text-white">
              {t("common.close")}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-xs text-white/60">
                <tr className="border-b border-white/10">
                  {["date", "memo", "branch", "debit", "credit", "balance"].map((k) => (
                    <th key={k} className="px-2 py-2 text-start font-medium">
                      {t(`erp.books.col.${k}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-white/5 text-white/60">
                  <td className="px-2 py-1.5" colSpan={5}>
                    {t("erp.books.opening")}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">{money(data.ledger.opening)}</td>
                </tr>
                {data.ledger.lines.map((l, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="px-2 py-1.5 tabular-nums text-white/60">{l.date}</td>
                    <td className="px-2 py-1.5">{l.memo || t(`erp.books.source.${l.source?.type}`)}</td>
                    <td className="px-2 py-1.5 text-white/55">{l.branch ? lookups.branchName(l.branch) : "—"}</td>
                    <td className="px-2 py-1.5 tabular-nums">{l.debit ? money(l.debit) : ""}</td>
                    <td className="px-2 py-1.5 tabular-nums">{l.credit ? money(l.credit) : ""}</td>
                    <td className="px-2 py-1.5 tabular-nums">{money(l.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {data && (
        <Card>
          <p className="mb-2 font-semibold">{t("erp.books.trialBalance")}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-xs text-white/60">
                <tr className="border-b border-white/10">
                  <th className="px-2 py-2 text-start font-medium">{t("erp.books.col.account")}</th>
                  <th className="px-2 py-2 text-start font-medium">{t("erp.books.col.debit")}</th>
                  <th className="px-2 py-2 text-start font-medium">{t("erp.books.col.credit")}</th>
                </tr>
              </thead>
              <tbody>
                {data.trialBalance.rows.map((r) => (
                  <tr key={r.account} className="border-b border-white/5">
                    <td className="px-2 py-1.5">{name(r.account)}</td>
                    <td className="px-2 py-1.5 tabular-nums">{r.balanceDebit ? money(r.balanceDebit) : ""}</td>
                    <td className="px-2 py-1.5 tabular-nums">{r.balanceCredit ? money(r.balanceCredit) : ""}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="px-2 py-2">{t("erp.books.total")}</td>
                  <td className="px-2 py-2 tabular-nums">{money(data.trialBalance.totalDebit)}</td>
                  <td className="px-2 py-2 tabular-nums">{money(data.trialBalance.totalCredit)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {journals.length > 0 && (
        <Card>
          <p className="mb-2 font-semibold">{t("erp.books.journals")}</p>
          <ul className="divide-y divide-white/5 text-sm">
            {journals.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="tabular-nums text-white/55">{j.date}</span>
                <span className="flex-1">{j.memo}</span>
                <span className="text-xs text-white/60">{j.lines.map((l) => `${name(l.account)} ${l.debit ? `+${l.debit}` : `−${l.credit}`}`).join(" · ")}</span>
                {canManage && (
                  <button type="button" aria-label={t("common.delete")} onClick={() => removeJournal(j.id)} className="text-white/60 hover:text-red-300">
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title={t("erp.books.addJournal")} wide>
        {adding && (
          <JournalForm
            accounts={data?.accounts || []}
            lookups={lookups}
            onDone={() => {
              setAdding(false);
              load();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function JournalForm({ accounts, lookups, onDone }) {
  const { t, lang } = useLanguage();
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), branch: "", memo: "", lines: [{ account: "cash", debit: "", credit: "" }, { account: "equity", debit: "", credit: "" }] });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const setLine = (i, k, v) => setForm((f) => ({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  const debit = form.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const credit = form.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("/api/finance/journals", { method: "POST", body: form });
      onDone();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <p className="text-xs text-white/60">{t("erp.books.journalHint")}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label={t("erp.books.col.date")} type="date" value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
        <Select label={t("erp.invoices.branch")} value={form.branch} onChange={(v) => setForm((f) => ({ ...f, branch: v }))} placeholder="—" options={lookups.branches.map((b) => ({ value: b.id, label: b.name?.[lang] }))} />
        <Input label={t("erp.books.col.memo")} value={form.memo} onChange={(v) => setForm((f) => ({ ...f, memo: v }))} />
      </div>
      {form.lines.map((l, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_110px_110px_32px] gap-2">
          <Select value={l.account} onChange={(v) => setLine(i, "account", v)} options={accounts.map((a) => ({ value: a.key, label: t(`erp.books.account.${a.key}`) }))} />
          <input type="number" value={l.debit} onChange={(e) => setLine(i, "debit", e.target.value)} placeholder={t("erp.books.col.debit")} aria-label={t("erp.books.col.debit")} dir="ltr" className="rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none" />
          <input type="number" value={l.credit} onChange={(e) => setLine(i, "credit", e.target.value)} placeholder={t("erp.books.col.credit")} aria-label={t("erp.books.col.credit")} dir="ltr" className="rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none" />
          <button type="button" aria-label={t("common.delete")} onClick={() => setForm((f) => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }))} className="text-white/60 hover:text-red-300">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, { account: "cash", debit: "", credit: "" }] }))} className="text-xs text-brand-orange hover:underline">
        + {t("erp.books.addLine")}
      </button>
      <p className={`text-sm ${Math.abs(debit - credit) < 0.01 && debit > 0 ? "text-emerald-300" : "text-amber-300"}`}>
        {t("erp.books.col.debit")} {debit} · {t("erp.books.col.credit")} {credit}
      </p>
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end">
        <Button onClick={save} loading={busy}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}
