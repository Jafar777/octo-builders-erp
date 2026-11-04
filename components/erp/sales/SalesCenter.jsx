"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, FileText, Plus, Send, Sparkles, Trash2, XCircle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatMoney } from "@/components/erp/intake/MoneyFields";
import Modal from "@/components/erp/ui/Modal";
import { Button, Card, ErrorText, Input, PageHeader, Select } from "@/components/erp/ui/fields";
import { useTaskLookups } from "@/components/erp/tasks/useTaskLookups";
import { useConfirm } from "@/components/erp/ui/Feedback";
import { DraftBar, useDraft } from "@/components/erp/ui/useDraft";
import { EmptyState } from "@/components/erp/ui/DataTools";

const STAGES = ["new", "contacted", "meeting", "proposal", "won", "lost"];
const SOURCES = ["referral", "website", "social", "walk_in", "repeat", "other"];
const fmtDate = (d, lang) => (d ? new Date(d).toLocaleDateString(lang === "ar" ? "ar" : "en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

// The Sales page: leads on a board by stage, and quotations with the delivery date the
// Gantt would give if accepted. An accepted quotation becomes an intake form.
export default function SalesCenter() {
  const { t } = useLanguage();
  const lookups = useTaskLookups();
  const [tab, setTab] = useState("leads");
  const [leads, setLeads] = useState(null);
  const [quotes, setQuotes] = useState(null);
  const [error, setError] = useState("");
  const [openLead, setOpenLead] = useState(null); // lead or "new"
  const [openQuote, setOpenQuote] = useState(null); // quotation, "new", or { lead }

  const load = useCallback(() => {
    api("/api/sales/leads").then(setLeads).catch((err) => setError(errorText(t, err)));
    api("/api/sales/quotations").then(setQuotes).catch(() => {});
  }, [t]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title={t("erp.nav.sales")}
        subtitle={t("erp.sales.subtitle")}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setOpenQuote("new")}>
              <FileText size={16} /> {t("erp.sales.newQuote")}
            </Button>
            <Button onClick={() => setOpenLead("new")}>
              <Plus size={16} /> {t("erp.sales.newLead")}
            </Button>
          </div>
        }
      />
      <div className="mb-5 flex gap-1 border-b border-white/10">
        {["leads", "quotes"].map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2.5 text-sm ${tab === k ? "border-brand-orange text-white" : "border-transparent text-white/50 hover:text-white"}`}>
            {t(`erp.sales.tab.${k}`)}
          </button>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>

      {tab === "leads" && leads && (
        <div className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-3 xl:grid-cols-6">
          {STAGES.map((stage) => {
            const list = leads.leads.filter((l) => l.stage === stage);
            return (
              <div key={stage} className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.02] p-2">
                <p className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wider text-white/60">
                  {t(`erp.sales.stage.${stage}`)} <span>{list.length}</span>
                </p>
                <div className="space-y-2">
                  {list.map((l) => {
                    const due = l.nextAction?.date && l.nextAction.date <= new Date().toISOString().slice(0, 10) && !["won", "lost"].includes(l.stage);
                    return (
                      <button key={l.id} type="button" onClick={() => setOpenLead(l)} className="w-full rounded-xl border border-white/10 bg-brand-navy p-2.5 text-start hover:border-white/30">
                        <p className="truncate text-sm font-medium">{l.company || l.name}</p>
                        {l.company && <p className="truncate text-xs text-white/60">{l.name}</p>}
                        {l.nextAction?.date && (
                          <p className={`mt-1 flex items-center gap-1 text-[11px] ${due ? "text-amber-300" : "text-white/60"}`}>
                            <CalendarClock size={11} /> {l.nextAction.date} {l.nextAction.note}
                          </p>
                        )}
                        {leads.money && l.estimatedValue > 0 && <p className="mt-1 text-[11px] text-emerald-300/80">{formatMoney(l.estimatedValue, l.currency, "en")}</p>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "quotes" && quotes && (
        <Card>
          {!quotes.quotations.length && <EmptyState compact text={t("erp.sales.noQuotes")} />}
          <ul className="divide-y divide-white/5">
            {quotes.quotations.map((q) => (
              <li key={q.id}>
                <button type="button" onClick={() => setOpenQuote(q)} className="flex w-full flex-wrap items-center gap-3 py-3 text-start text-sm hover:bg-white/[0.02]">
                  <span className="font-mono text-xs text-white/50" dir="ltr">
                    {q.number}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{q.projectName}</span>
                    <span className="block truncate text-xs text-white/60">{q.clientName}</span>
                  </span>
                  <span className="text-xs text-white/55">{q.delivery ? t("erp.sales.deliveryShort", { date: fmtDate(q.delivery.date) }) : t("erp.sales.noPreview")}</span>
                  {quotes.money && q.total > 0 && <span className="tabular-nums">{formatMoney(q.total, q.currency, "en")}</span>}
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">{t(`erp.sales.quoteStatus.${q.status}`)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal open={Boolean(openLead)} onClose={() => setOpenLead(null)} title={openLead === "new" ? t("erp.sales.newLead") : openLead?.company || openLead?.name || ""} wide>
        {openLead && (
          <LeadForm
            key={openLead === "new" ? "new" : openLead.id}
            lead={openLead === "new" ? null : openLead}
            money={leads?.money}
            lookups={lookups}
            quotes={(quotes?.quotations || []).filter((q) => openLead !== "new" && q.lead === openLead.id)}
            onQuote={(lead) => {
              setOpenLead(null);
              setOpenQuote({ lead });
            }}
            onDone={() => {
              setOpenLead(null);
              load();
            }}
          />
        )}
      </Modal>
      <Modal open={Boolean(openQuote)} onClose={() => setOpenQuote(null)} title={openQuote?.number || t("erp.sales.newQuote")} wide>
        {openQuote && quotes && (
          <QuoteForm
            key={openQuote.id || "new"}
            quote={openQuote.id ? openQuote : null}
            lead={openQuote.lead || null}
            templates={quotes.templates}
            money={quotes.money}
            lookups={lookups}
            onChanged={load}
            onDone={() => {
              setOpenQuote(null);
              load();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function LeadForm({ lead, money, lookups, quotes, onQuote, onDone }) {
  const { t, lang } = useLanguage();
  const confirm = useConfirm();
  const [form, setForm] = useState({
    name: lead?.name || "",
    company: lead?.company || "",
    phone: lead?.phone || "",
    email: lead?.email || "",
    source: lead?.source || "other",
    stage: lead?.stage || "new",
    department: lead?.department || "",
    need: lead?.need || "",
    estimatedValue: lead?.estimatedValue || "",
    currency: lead?.currency || "",
    nextAction: lead?.nextAction || { date: "", note: "" },
    lostReason: lead?.lostReason || "",
  });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setBusy(true);
    setError("");
    try {
      if (lead) await api(`/api/sales/leads/${lead.id}`, { method: "PATCH", body: { ...form, note } });
      else await api("/api/sales/leads", { method: "POST", body: form });
      onDone();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!(await confirm({ text: t("common.confirmDelete"), kind: "delete" }))) return;
    await api(`/api/sales/leads/${lead.id}`, { method: "DELETE" }).catch(() => {});
    onDone();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label={t("erp.sales.name")} value={form.name} onChange={set("name")} />
        <Input label={t("erp.sales.company")} value={form.company} onChange={set("company")} />
        <Input label={t("erp.sales.phone")} value={form.phone} onChange={set("phone")} dir="ltr" />
        <Input label={t("erp.sales.email")} value={form.email} onChange={set("email")} dir="ltr" />
        <Select label={t("erp.sales.source")} value={form.source} onChange={set("source")} options={SOURCES.map((s) => ({ value: s, label: t(`erp.sales.sources.${s}`) }))} />
        <Select label={t("erp.sales.department")} value={form.department} onChange={set("department")} placeholder="—" options={lookups.departments.map((d) => ({ value: d.id, label: d.name?.[lang] }))} />
        {lead && <Select label={t("erp.sales.stageLabel")} value={form.stage} onChange={set("stage")} options={STAGES.map((s) => ({ value: s, label: t(`erp.sales.stage.${s}`) }))} />}
        {money && <Input label={t("erp.sales.estimatedValue")} type="number" value={form.estimatedValue} onChange={set("estimatedValue")} dir="ltr" />}
        <Input label={t("erp.sales.nextDate")} type="date" value={form.nextAction.date} onChange={(v) => setForm((f) => ({ ...f, nextAction: { ...f.nextAction, date: v } }))} />
        <Input label={t("erp.sales.nextNote")} value={form.nextAction.note} onChange={(v) => setForm((f) => ({ ...f, nextAction: { ...f.nextAction, note: v } }))} />
      </div>
      <label className="block text-sm text-white/70">
        {t("erp.sales.need")}
        <textarea rows={3} value={form.need} onChange={(e) => set("need")(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/30" />
      </label>
      {form.stage === "lost" && <Input label={t("erp.sales.lostReason")} value={form.lostReason} onChange={set("lostReason")} />}
      {lead && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-white/70">{t("erp.sales.notes")}</p>
          {lead.notes.map((n, i) => (
            <p key={i} className="rounded-xl bg-white/5 px-3 py-2 text-sm">
              {n.text}
              <span className="mt-1 block text-[11px] text-white/55">
                {n.by} · {fmtDate(n.at, lang)}
              </span>
            </p>
          ))}
          <Input value={note} onChange={setNote} placeholder={t("erp.sales.addNote")} />
        </div>
      )}
      {lead && quotes.length > 0 && <p className="text-xs text-white/60">{t("erp.sales.hasQuotes", { list: quotes.map((q) => q.number).join(", ") })}</p>}
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap justify-between gap-2">
        <div className="flex gap-2">
          {lead && (
            <Button variant="danger" onClick={remove} aria-label={t("common.delete")}>
              <Trash2 size={15} />
            </Button>
          )}
          {lead && !["won", "lost"].includes(lead.stage) && (
            <Button variant="ghost" onClick={() => onQuote(lead)}>
              <FileText size={15} /> {t("erp.sales.makeQuote")}
            </Button>
          )}
        </div>
        <Button onClick={save} loading={busy} disabled={!form.name}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

function QuoteForm({ quote, lead, templates, money, lookups, onChanged, onDone }) {
  const { t, lang } = useLanguage();
  const [current, setCurrent] = useState(quote);
  const [form, setForm] = useState(() => ({
    lead: quote?.lead || lead?.id || "",
    clientName: quote?.clientName || lead?.company || lead?.name || "",
    phone: quote?.phone || lead?.phone || "",
    projectName: quote?.projectName || "",
    department: quote?.department || lead?.department || "",
    template: quote?.template || "",
    stages: quote?.stages || [],
    items: quote?.items?.length ? quote.items : [{ description: "", amount: "" }],
    currency: quote?.currency || "",
    validUntil: quote?.validUntil || "",
    notes: quote?.notes || "",
  }));
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const editable = !current || ["draft", "sent"].includes(current.status);
  const draft = useDraft(quote ? `quote-${quote.id}` : `quote-new-${lead?.id || ""}`, form, setForm, { enabled: editable });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const personName = (id) => lookups.people.find((p) => p.id === id)?.name || "—";

  function pickTemplate(id) {
    const tpl = templates.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      template: id,
      department: f.department || tpl?.department || "",
      stages: (tpl?.stages || []).map((s) => ({ key: s.key, name: s.name, hours: 8, department: s.department || null, after: s.after, waitForPrevious: s.waitForPrevious })),
    }));
  }

  async function call(action, extra = {}) {
    setBusy(action);
    setError("");
    try {
      let id = current?.id;
      if (!id) {
        const res = await api("/api/sales/quotations", { method: "POST", body: form });
        id = res.id;
      } else if (editable && action !== "accept") {
        await api(`/api/sales/quotations/${id}`, { method: "PATCH", body: { action: "edit", ...form } });
      }
      if (action !== "save") await api(`/api/sales/quotations/${id}`, { method: "PATCH", body: { action, ...extra } });
      draft.clear();
      const fresh = (await api("/api/sales/quotations", { quiet: true })).quotations.find((q) => q.id === id);
      setCurrent(fresh);
      onChanged();
      if (action === "accept" || action === "reject") onDone();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(null);
    }
  }

  const totalHours = form.stages.reduce((s, x) => s + (Number(x.hours) || 0), 0);
  return (
    <div className="space-y-4">
      {editable && <DraftBar draft={draft} />}
      <fieldset disabled={!editable} className="space-y-4 disabled:opacity-70">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label={t("erp.sales.clientName")} value={form.clientName} onChange={set("clientName")} />
          <Input label={t("erp.sales.phone")} value={form.phone} onChange={set("phone")} dir="ltr" />
          <Input label={t("erp.sales.projectName")} value={form.projectName} onChange={set("projectName")} />
          <Select label={t("erp.sales.department")} value={form.department} onChange={set("department")} placeholder="—" options={lookups.departments.map((d) => ({ value: d.id, label: d.name?.[lang] }))} />
          <Select label={t("erp.sales.template")} value={form.template} onChange={pickTemplate} placeholder="—" options={templates.map((x) => ({ value: x.id, label: x.name?.[lang] }))} />
          <Input label={t("erp.sales.validUntil")} type="date" value={form.validUntil} onChange={set("validUntil")} />
        </div>
        {form.stages.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-white/70">{t("erp.sales.stagesHours", { n: totalHours })}</p>
            {form.stages.map((s, i) => (
              <div key={s.key} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{s.name?.[lang] || s.key}</span>
                <input
                  type="number"
                  value={s.hours}
                  onChange={(e) => setForm((f) => ({ ...f, stages: f.stages.map((x, j) => (j === i ? { ...x, hours: e.target.value } : x)) }))}
                  aria-label={t("erp.sales.hours")}
                  dir="ltr"
                  className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 outline-none"
                />
                <span className="w-6 text-xs text-white/60">{t("erp.sales.h")}</span>
              </div>
            ))}
          </div>
        )}
        {money && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-white/70">{t("erp.sales.price")}</p>
            {form.items.map((it, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={it.description}
                  onChange={(e) => setForm((f) => ({ ...f, items: f.items.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) }))}
                  placeholder={t("erp.invoices.itemDescription")}
                  aria-label={t("erp.invoices.itemDescription")}
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none"
                />
                <input
                  type="number"
                  value={it.amount}
                  onChange={(e) => setForm((f) => ({ ...f, items: f.items.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) }))}
                  aria-label={t("erp.invoices.amount")}
                  dir="ltr"
                  className="w-32 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none"
                />
              </div>
            ))}
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setForm((f) => ({ ...f, items: [...f.items, { description: "", amount: "" }] }))} className="text-xs text-brand-orange hover:underline">
                + {t("erp.invoices.addItem")}
              </button>
              <div className="w-32">
                <Select value={form.currency} onChange={set("currency")} placeholder={t("erp.invoices.currency")} options={["USD", "SAR"].map((c) => ({ value: c, label: c }))} />
              </div>
            </div>
          </div>
        )}
      </fieldset>

      {/* The Gantt's answer */}
      <div className="rounded-2xl border border-sky-400/20 bg-sky-400/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles size={15} className="text-sky-300" />
            {current?.delivery ? t("erp.sales.deliveryOn", { date: fmtDate(current.delivery.date, lang) }) : t("erp.sales.deliveryAsk")}
          </p>
          <Button variant="ghost" onClick={() => call("preview")} loading={busy === "preview"} disabled={!form.stages.length || !form.projectName || !form.clientName}>
            <CalendarClock size={15} /> {t("erp.sales.preview")}
          </Button>
        </div>
        {current?.delivery && (
          <ul className="mt-3 space-y-1 text-xs text-white/60">
            {current.delivery.stages.map((s) => (
              <li key={s.key} className="flex flex-wrap justify-between gap-2">
                <span>{form.stages.find((x) => x.key === s.key)?.name?.[lang] || s.key}</span>
                <span>
                  {s.personName || personName(s.person)} · {fmtDate(s.start, lang)} → {fmtDate(s.end, lang)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-white/60">{t("erp.sales.previewHint")}</p>
      </div>

      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap justify-end gap-2">
        {editable && (
          <>
            <Button variant="ghost" onClick={() => call("save")} loading={busy === "save"}>
              {t("common.save")}
            </Button>
            <Button variant="ghost" onClick={() => call("send")} loading={busy === "send"}>
              <Send size={15} /> {t("erp.sales.send")}
            </Button>
            {current && (
              <Button variant="danger" onClick={() => call("reject")} loading={busy === "reject"}>
                <XCircle size={15} /> {t("erp.sales.rejected")}
              </Button>
            )}
            {current && (
              <Button onClick={() => call("accept")} loading={busy === "accept"}>
                <CheckCircle2 size={15} /> {t("erp.sales.accept")}
              </Button>
            )}
          </>
        )}
        {current?.status === "accepted" && <p className="text-sm text-emerald-300">{t("erp.sales.acceptedNote")}</p>}
      </div>
    </div>
  );
}
