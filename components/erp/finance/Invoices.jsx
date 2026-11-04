"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, CheckCircle2, FileText, Plus, Send, Trash2, Wallet } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatMoney } from "@/components/erp/intake/MoneyFields";
import Modal from "@/components/erp/ui/Modal";
import { Button, Card, ErrorText, Input, Select } from "@/components/erp/ui/fields";
import { EmptyState, ShowMore, SortTh, TableToolbar, useTableTools } from "@/components/erp/ui/DataTools";
import { useConfirm, useAsk } from "@/components/erp/ui/Feedback";

const STATE_TONE = {
  draft: "bg-white/10 text-white/60",
  issued: "bg-sky-500/15 text-sky-300",
  partial: "bg-amber-500/15 text-amber-300",
  paid: "bg-emerald-500/15 text-emerald-300",
  void: "bg-red-500/10 text-red-300 line-through",
};
const AGING = ["current", "d30", "d60", "d90", "d90plus"];

// Client invoices: drafts (by hand or from a reached Gantt milestone), issued, paid.
// Money owed by age and by client. No tax lines.
export default function Invoices({ lookups }) {
  const { t, lang } = useLanguage();
  const ask = useAsk();
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("open");
  const [editing, setEditing] = useState(null); // invoice or "new"
  const [paying, setPaying] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api("/api/finance/invoices").then(setData).catch((err) => setError(errorText(t, err)));
  }, [t]);
  useEffect(() => {
    load();
  }, [load]);

  async function act(inv, body) {
    setError("");
    try {
      await api(`/api/finance/invoices/${inv.id}`, { method: "PATCH", body });
      load();
    } catch (err) {
      setError(errorText(t, err));
    }
  }
  async function remove(inv) {
    if (!(await confirm({ text: t("common.confirmDelete"), kind: "delete" }))) return;
    await api(`/api/finance/invoices/${inv.id}`, { method: "DELETE" }).catch((err) => setError(errorText(t, err)));
    load();
  }

  const list = useMemo(() => {
    const all = data?.invoices || [];
    if (filter === "open") return all.filter((i) => ["draft", "issued", "partial"].includes(i.state));
    if (filter === "all") return all;
    return all.filter((i) => i.state === filter);
  }, [data, filter]);
  const base = data?.base;
  const clientOf = (i) => i.clientName || lookups.clientName(i.client) || "";
  const tools = useTableTools(
    list,
    { number: (i) => i.number, client: clientOf, project: (i) => i.projectName, issueDate: (i) => i.issueDate, dueDate: (i) => i.dueDate, total: (i) => i.total, outstanding: (i) => i.outstanding, state: (i) => i.state },
    { key: "invoices", search: (i) => [i.number, clientOf(i), i.projectName, t(`erp.invoices.state.${i.state}`)].join(" ") }
  );
  const exportColumns = ["number", "client", "project", "issueDate", "dueDate", "total", "outstanding", "state"].map((k) => ({
    label: t(`erp.invoices.col.${k}`),
    value: (i) => (k === "client" ? clientOf(i) : k === "project" ? i.projectName : k === "state" ? t(`erp.invoices.state.${i.state}`) : k === "total" || k === "outstanding" ? `${i[k] ?? ""} ${i.currency}` : i[k]),
  }));
  const owed = data ? AGING.reduce((s, k) => s + data.aging[k], 0) : 0;

  return (
    <div className="space-y-5">
      {data && (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 lg:col-span-1">
            <p className="text-lg font-semibold tabular-nums">{formatMoney(owed, base, lang)}</p>
            <p className="text-xs text-white/60">{t("erp.invoices.owed")}</p>
          </div>
          {AGING.map((k) => (
            <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className={`text-lg font-semibold tabular-nums ${k !== "current" && data.aging[k] > 0 ? "text-amber-300" : ""}`}>{formatMoney(data.aging[k], base, lang)}</p>
              <p className="text-xs text-white/60">{t(`erp.invoices.aging.${k}`)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-48">
          <Select value={filter} onChange={setFilter} options={["open", "draft", "issued", "partial", "paid", "void", "all"].map((k) => ({ value: k, label: t(`erp.invoices.filter.${k}`) }))} />
        </div>
        {data?.canManage && (
          <Button onClick={() => setEditing("new")}>
            <Plus size={16} /> {t("erp.invoices.new")}
          </Button>
        )}
      </div>
      <ErrorText>{error}</ErrorText>

      <Card>
        {list.length > 0 && <TableToolbar tools={tools} exportFile={t("erp.ux.invoicesFile")} exportColumns={exportColumns} />}
        {!tools.view.length ? (
          <EmptyState
            icon={FileText}
            compact
            title={list.length ? t("erp.ux.noMatches") : t("erp.ux.emptyTitle")}
            text={list.length ? t("erp.ux.noMatchesText") : t("erp.invoices.none")}
            action={
              !list.length && data?.canManage ? (
                <Button onClick={() => setEditing("new")}>
                  <Plus size={16} /> {t("erp.invoices.new")}
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-xs text-white/60">
                <tr className="border-b border-white/10 text-start">
                  {["number", "client", "project", "issueDate", "dueDate", "total", "outstanding", "state"].map((k) => (
                    <SortTh key={k} tools={tools} col={k} className="!px-2 !py-2">
                      {t(`erp.invoices.col.${k}`)}
                    </SortTh>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {tools.shown.map((i) => (
                  <tr key={i.id} className="border-b border-white/5 align-top">
                    <td className="px-2 py-2.5 font-mono text-xs" dir="ltr">
                      {i.number || <span className="text-white/55">{t("erp.invoices.draftLabel")}</span>}
                    </td>
                    <td className="px-2 py-2.5">{i.clientName || lookups.clientName(i.client) || "—"}</td>
                    <td className="px-2 py-2.5 text-white/65">{i.projectName || "—"}</td>
                    <td className="px-2 py-2.5 tabular-nums text-white/65">{i.issueDate || "—"}</td>
                    <td className={`px-2 py-2.5 tabular-nums ${i.aging && i.aging !== "current" ? "text-amber-300" : "text-white/65"}`}>{i.dueDate || "—"}</td>
                    <td className="px-2 py-2.5 tabular-nums">{formatMoney(i.total, i.currency, lang)}</td>
                    <td className="px-2 py-2.5 tabular-nums">{i.state === "draft" || i.state === "void" ? "—" : formatMoney(i.outstanding, i.currency, lang)}</td>
                    <td className="px-2 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATE_TONE[i.state]}`}>{t(`erp.invoices.state.${i.state}`)}</span>
                    </td>
                    <td className="px-2 py-2.5">
                      {data.canManage && (
                        <div className="flex justify-end gap-1">
                          {i.status === "draft" && (
                            <>
                              <IconBtn label={t("common.edit")} onClick={() => setEditing(i)} icon={FileText} />
                              <IconBtn label={t("erp.invoices.issue")} onClick={() => act(i, { action: "issue", dueDate: i.dueDate })} icon={Send} tone="text-sky-300" />
                              <IconBtn label={t("common.delete")} onClick={() => remove(i)} icon={Trash2} tone="text-red-300" />
                            </>
                          )}
                          {(i.state === "issued" || i.state === "partial") && (
                            <IconBtn label={t("erp.invoices.recordPayment")} onClick={() => setPaying(i)} icon={Wallet} tone="text-emerald-300" />
                          )}
                          {i.status === "issued" && (
                            <IconBtn
                              label={t("erp.invoices.void")}
                              onClick={async () => {
                                const reason = await ask({ text: t("erp.invoices.voidReason"), danger: true, confirmLabel: t("erp.invoices.void") });
                                if (reason !== null) act(i, { action: "void", reason });
                              }}
                              icon={Ban}
                              tone="text-red-300"
                            />
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ShowMore tools={tools} />
          </div>
        )}
      </Card>

      {data?.clients?.length > 0 && (
        <Card>
          <p className="mb-3 font-semibold">{t("erp.invoices.byClient")}</p>
          <ul className="divide-y divide-white/5 text-sm">
            {data.clients.map((c) => (
              <li key={c.client} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{c.client}</span>
                <span className="text-white/60">{t("erp.invoices.clientLine", { n: c.invoices, date: c.oldestDue || "—" })}</span>
                <span className="font-semibold tabular-nums">{formatMoney(c.outstandingBase, base, lang)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={t(editing === "new" ? "erp.invoices.new" : "erp.invoices.edit")} wide>
        {editing && (
          <InvoiceForm
            key={editing === "new" ? "new" : editing.id}
            invoice={editing === "new" ? null : editing}
            lookups={lookups}
            onDone={() => {
              setEditing(null);
              load();
            }}
          />
        )}
      </Modal>
      <Modal open={Boolean(paying)} onClose={() => setPaying(null)} title={t("erp.invoices.recordPayment")}>
        {paying && (
          <PaymentForm
            key={paying.id}
            invoice={paying}
            lookups={lookups}
            onDone={() => {
              setPaying(null);
              load();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function IconBtn({ label, onClick, icon: Icon, tone = "text-white/60" }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className={`flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 hover:bg-white/10 ${tone}`}>
      <Icon size={14} />
    </button>
  );
}

function InvoiceForm({ invoice, lookups, onDone }) {
  const { t, lang } = useLanguage();
  const currencies = lookups.settings?.currencies.list || [];
  const [form, setForm] = useState(() => ({
    project: invoice?.project || "",
    client: invoice?.client || "",
    clientName: invoice?.clientName || "",
    branch: invoice?.branch || "",
    currency: invoice?.currency || lookups.base,
    dueDate: invoice?.dueDate || "",
    notes: invoice?.notes || "",
    items: invoice?.items?.length ? invoice.items : [{ description: "", amount: "" }],
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const total = form.items.reduce((s, x) => s + (Number(x.amount) || 0), 0);

  async function save() {
    setBusy(true);
    setError("");
    try {
      if (invoice) await api(`/api/finance/invoices/${invoice.id}`, { method: "PATCH", body: { action: "edit", ...form } });
      else await api("/api/finance/invoices", { method: "POST", body: form });
      onDone();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label={t("erp.invoices.col.project")} value={form.project} onChange={set("project")} placeholder="—" options={lookups.projects.map((p) => ({ value: p.id, label: p.name?.[lang] || p.code }))} />
        <Select label={t("erp.invoices.col.client")} value={form.client} onChange={set("client")} placeholder="—" options={lookups.clients.map((c) => ({ value: c.id, label: c.name }))} />
        <Input label={t("erp.invoices.clientName")} value={form.clientName} onChange={set("clientName")} />
        <Select label={t("erp.invoices.branch")} value={form.branch} onChange={set("branch")} placeholder="—" options={lookups.branches.map((b) => ({ value: b.id, label: b.name?.[lang] }))} />
        <Select label={t("erp.invoices.currency")} value={form.currency} onChange={set("currency")} options={currencies.map((c) => ({ value: c.code, label: c.code }))} />
        <Input label={t("erp.invoices.col.dueDate")} type="date" value={form.dueDate} onChange={set("dueDate")} />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-white/70">{t("erp.invoices.items")}</p>
        {form.items.map((it, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={it.description}
              onChange={(e) => setForm((f) => ({ ...f, items: f.items.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) }))}
              placeholder={t("erp.invoices.itemDescription")}
              aria-label={t("erp.invoices.itemDescription")}
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/30"
            />
            <input
              type="number"
              value={it.amount}
              onChange={(e) => setForm((f) => ({ ...f, items: f.items.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) }))}
              placeholder="0"
              aria-label={t("erp.invoices.amount")}
              dir="ltr"
              className="w-32 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/30"
            />
            <button type="button" aria-label={t("common.delete")} onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, j) => j !== i) }))} className="px-2 text-white/60 hover:text-red-300">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setForm((f) => ({ ...f, items: [...f.items, { description: "", amount: "" }] }))} className="text-xs text-brand-orange hover:underline">
          + {t("erp.invoices.addItem")}
        </button>
        <p className="text-end text-sm font-semibold">
          {t("erp.invoices.total")}: {formatMoney(total, form.currency, lang)}
        </p>
      </div>
      <Input label={t("erp.invoices.notes")} value={form.notes} onChange={set("notes")} />
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end">
        <Button onClick={save} loading={busy}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

function PaymentForm({ invoice, lookups, onDone }) {
  const { t, lang } = useLanguage();
  const [amount, setAmount] = useState(String(invoice.outstanding));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [branch, setBranch] = useState(invoice.branch || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/finance/invoices/${invoice.id}`, { method: "PATCH", body: { action: "payment", amount, date, branch } });
      onDone();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-white/60">
        {invoice.number} · {t("erp.invoices.col.outstanding")}: {formatMoney(invoice.outstanding, invoice.currency, lang)}
      </p>
      <Input label={`${t("erp.invoices.amount")} (${invoice.currency})`} type="number" value={amount} onChange={setAmount} dir="ltr" />
      <Input label={t("erp.invoices.paymentDate")} type="date" value={date} onChange={setDate} />
      <Select label={t("erp.invoices.branch")} value={branch} onChange={setBranch} placeholder="—" options={lookups.branches.map((b) => ({ value: b.id, label: b.name?.[lang] }))} />
      <p className="flex items-start gap-2 text-xs text-white/60">
        <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> {t("erp.invoices.paymentHint")}
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
