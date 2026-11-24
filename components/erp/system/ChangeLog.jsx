"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bug, CheckCircle2, Clock, Code2, Eye, MapPin, MessageCircle, Plus, Send, Sparkles, XCircle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import Modal from "@/components/erp/ui/Modal";
import { Button, Card, ErrorText, Input, Label } from "@/components/erp/ui/fields";
import { useAsk, useConfirm, useToast } from "@/components/erp/ui/Feedback";
import ChangeRequestForm from "@/components/erp/system/ChangeRequestForm";

const area = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-white/30";
const fmt = (d, lang) => new Date(d).toLocaleString(lang === "ar" ? "ar" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
const STATUS_TONE = {
  open: "bg-amber-500/15 text-amber-300",
  accepted: "bg-sky-500/15 text-sky-300",
  done: "bg-emerald-500/15 text-emerald-300",
  declined: "bg-red-500/15 text-red-300",
  withdrawn: "bg-white/10 text-white/60",
};
const FILTERS = ["all", "open", "accepted", "done", "declined", "withdrawn", "log"];

// System → Change log: the CEO's requests to the programmer and the changes the
// programmer logged (lib/changeLog.js). The programmer takes requests on, closes them
// with how they were fixed, or declines them; the CEO is told each time.
export default function ChangeLog() {
  const { t, lang } = useLanguage();
  const ask = useAsk();
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [closing, setClosing] = useState(null); // ticket being marked done
  const [logging, setLogging] = useState(null); // {} new log, or the log being edited
  const [replying, setReplying] = useState(null); // the request whose reply box is open

  const load = useCallback(() => {
    const q = filter === "all" ? "" : filter === "log" ? "?kind=log" : `?status=${filter}&kind=request`;
    api(`/api/change-log${q}`).then(setData).catch((err) => setError(errorText(t, err)));
  }, [filter, t]);
  useEffect(() => {
    load();
  }, [load]);

  async function act(ticket, body) {
    setError("");
    try {
      await api(`/api/change-log/${ticket.id}`, { method: "PATCH", body });
      load();
    } catch (err) {
      setError(errorText(t, err));
    }
  }
  async function decline(ticket) {
    const note = await ask({ text: t("erp.changes.declineAsk"), required: true, danger: true, confirmLabel: t("erp.changes.decline") });
    if (note) act(ticket, { action: "decline", note });
  }
  async function remove(ticket, text, confirmLabel) {
    if (!(await confirm({ text, kind: "delete", confirmLabel }))) return;
    try {
      await api(`/api/change-log/${ticket.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  const stats = data?.stats;
  // Which side of the conversation this person is, and what waits for their answer.
  const me = data?.canAnswer ? "programmer" : data?.canRequest ? "ceo" : null;
  const waitingMine = (data?.tickets || []).filter((tk) => me && tk.waitingFor === me).length;
  return (
    <div className="space-y-5">
      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {["requests", "open", "accepted", "done", "declined", "logs"].map((k) => (
            <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className={`text-2xl font-semibold tabular-nums ${k === "open" && stats.open ? "text-amber-300" : "text-white"}`}>{stats[k]}</p>
              <p className="text-xs text-white/60">{t(`erp.changes.stat.${k}`)}</p>
            </div>
          ))}
        </div>
      )}
      {waitingMine > 0 && (
        <p className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          <MessageCircle size={15} /> {t("erp.changes.stat.waiting")}: {waitingMine}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              data-active={filter === f}
              className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/60 data-[active=true]:border-brand-orange/60 data-[active=true]:bg-brand-orange/15 data-[active=true]:text-white"
            >
              {t(`erp.changes.filter.${f}`)}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {data?.canRequest && (
            <Button onClick={() => setRequesting(true)}>
              <Plus size={15} /> {t("erp.changes.formTitle")}
            </Button>
          )}
          {data?.canAnswer && (
            <Button onClick={() => setLogging({})}>
              <Plus size={15} /> {t("erp.changes.addLog")}
            </Button>
          )}
        </div>
      </div>
      <ErrorText>{error}</ErrorText>

      {data && !data.tickets.length && <p className="text-sm text-white/55">{t("erp.changes.none")}</p>}
      <div className="space-y-3">
        {data?.tickets.map((tk) => (
          <div key={tk.id} data-entity={`change:${tk.id}`} className="rounded-2xl">
          <Card>
            <div className="flex flex-wrap items-start gap-3">
              <span className="rounded-lg bg-white/10 px-2 py-0.5 font-mono text-sm tabular-nums" dir="ltr">
                {tk.code}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{tk.title || tk.summary.split("\n")[0].slice(0, 120)}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/55">
                  {tk.kind === "log" ? (
                    <span className="flex items-center gap-1">
                      <Code2 size={12} /> {t("erp.changes.kind.log")}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      {tk.type === "feature" ? <Sparkles size={12} /> : <Bug size={12} />} {t(`erp.changes.type.${tk.type}`)}
                    </span>
                  )}
                  {(tk.page.label || tk.page.tab) && (
                    <span className="flex items-center gap-1">
                      <MapPin size={12} />
                      {tk.page.path ? (
                        <Link href={tk.page.path} className="hover:text-white hover:underline">
                          {[tk.page.label, tk.page.tab].filter(Boolean).join(" › ")}
                        </Link>
                      ) : (
                        [tk.page.label, tk.page.tab].filter(Boolean).join(" › ")
                      )}
                    </span>
                  )}
                  {tk.viewAs && (
                    <span className="flex items-center gap-1 text-amber-300/80">
                      <Eye size={12} /> {t("erp.changes.seenAs", { name: tk.viewAs.name })}
                    </span>
                  )}
                  {tk.requestedBy && <span>{t("erp.changes.requestedBy", { name: tk.requestedBy })}</span>}
                  <span>{fmt(tk.createdAt, lang)}</span>
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {tk.kind === "request" && <span className={`rounded-full px-2.5 py-0.5 text-xs ${STATUS_TONE[tk.status]}`}>{t(`erp.changes.status.${tk.status}`)}</span>}
                {tk.waitingFor && (
                  <span className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs ${tk.waitingFor === me ? "bg-amber-500/20 font-medium text-amber-200" : "bg-white/5 text-white/55"}`}>
                    <MessageCircle size={12} /> {tk.waitingFor === me ? t("erp.changes.waitingMe") : t(`erp.changes.waiting.${tk.waitingFor}`)}
                  </span>
                )}
              </div>
            </div>

            {(tk.title || tk.summary.includes("\n") || tk.summary.length > 120) && <p className="mt-3 whitespace-pre-wrap text-sm text-white/80">{tk.summary}</p>}

            {tk.fix && (tk.fix.how || tk.fix.changes) && (
              <div className="mt-3 space-y-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3 text-sm">
                {tk.fix.how && (
                  <div>
                    <p className="text-xs font-medium text-emerald-300">{t(tk.kind === "log" ? "erp.changes.logHow" : "erp.changes.fixHow")}</p>
                    <p className="whitespace-pre-wrap text-white/85">{tk.fix.how}</p>
                  </div>
                )}
                {tk.fix.changes && (
                  <div>
                    <p className="text-xs font-medium text-emerald-300">{t("erp.changes.fixChanges")}</p>
                    <p className="whitespace-pre-wrap text-white/85">{tk.fix.changes}</p>
                  </div>
                )}
                <p className="flex items-center gap-1 text-[11px] text-white/50">
                  <CheckCircle2 size={12} /> {tk.fix.by ? t("erp.changes.fixedBy", { name: tk.fix.by }) : ""} · {fmt(tk.fix.at, lang)}
                </p>
              </div>
            )}
            {tk.status === "accepted" && tk.acceptedAt && (
              <p className="mt-3 flex items-center gap-1 text-xs text-sky-300/80">
                <Clock size={12} /> {t("erp.changes.status.accepted")} · {tk.acceptedBy} · {fmt(tk.acceptedAt, lang)}
              </p>
            )}
            {tk.status === "declined" && tk.declineNote && (
              <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/[0.06] p-3 text-sm">
                <p className="flex items-center gap-1 text-xs font-medium text-red-300">
                  <XCircle size={12} /> {t("erp.changes.declined")}
                </p>
                <p className="whitespace-pre-wrap text-white/85">{tk.declineNote}</p>
              </div>
            )}

            {tk.kind === "request" && (tk.replies.length > 0 || replying === tk.id) && (
              <Conversation ticket={tk} me={me} open={replying === tk.id} onSent={() => {
                setReplying(null);
                load();
              }} />
            )}

            <div className="mt-3 flex flex-wrap justify-end gap-2 empty:hidden">
              {me && tk.kind === "request" && tk.status !== "withdrawn" && replying !== tk.id && (
                <Button variant="ghost" onClick={() => setReplying(tk.id)}>
                  <MessageCircle size={14} /> {t("erp.changes.replyOpen")}
                </Button>
              )}
              {data.canAnswer && tk.kind === "request" && tk.status === "open" && <Button onClick={() => act(tk, { action: "accept" })}>{t("erp.changes.accept")}</Button>}
              {data.canAnswer && tk.kind === "request" && ["open", "accepted"].includes(tk.status) && (
                <>
                  <Button onClick={() => setClosing(tk)}>{t("erp.changes.finish")}</Button>
                  <Button variant="danger" onClick={() => decline(tk)}>
                    {t("erp.changes.decline")}
                  </Button>
                </>
              )}
              {data.canAnswer && tk.kind === "log" && (
                <>
                  <Button variant="ghost" onClick={() => setLogging(tk)}>
                    {t("erp.changes.edit")}
                  </Button>
                  <Button variant="ghost" onClick={() => remove(tk, t("erp.changes.deleteAsk"))}>
                    {t("erp.changes.delete")}
                  </Button>
                </>
              )}
              {data.canRequest && tk.kind === "request" && tk.status === "open" && (
                <Button variant="ghost" onClick={() => remove(tk, t("erp.changes.withdrawAsk"), t("erp.changes.withdraw"))}>
                  {t("erp.changes.withdraw")}
                </Button>
              )}
            </div>
          </Card>
          </div>
        ))}
      </div>

      <ChangeRequestForm
        open={requesting}
        onClose={() => setRequesting(false)}
        page={{ path: "/dashboard/system?tab=changes", key: "system", label: t("erp.nav.system"), tab: t("erp.system.tab.changes") }}
        onSent={load}
      />
      <FixModal ticket={closing} onClose={() => setClosing(null)} onDone={load} />
      <LogModal entry={logging} onClose={() => setLogging(null)} onDone={load} />
    </div>
  );
}

// The conversation on a request: the programmer's questions and comments, the CEO's
// answers, and (when `open`) a box to reply. The other side is told of each reply.
function Conversation({ ticket, me, open, onSent }) {
  const { t, lang } = useLanguage();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/change-log/${ticket.id}`, { method: "PATCH", body: { action: "reply", text } });
      setText("");
      onSent();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-white/60">
        <MessageCircle size={12} /> {t("erp.changes.conversation")}
      </p>
      {ticket.replies.map((r) => (
        <div key={r.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${r.from === me ? "ms-auto bg-brand-orange/15" : "bg-white/[0.06]"}`}>
          <p className="mb-0.5 text-[11px] text-white/50">
            {t(`erp.changes.from.${r.from}`)}
            {r.by ? ` · ${r.by}` : ""} · {fmt(r.at, lang)}
          </p>
          <p className="whitespace-pre-wrap text-white/90">{r.text}</p>
        </div>
      ))}
      {open && me && (
        <div className="space-y-2 pt-1">
          <textarea autoFocus rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={t(`erp.changes.replyPlaceholder.${me}`)} className={area} />
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onSent()}>
              {t("common.cancel")}
            </Button>
            <Button onClick={send} loading={busy} disabled={!text.trim()}>
              <Send size={14} /> {t("erp.changes.reply")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// The programmer closes a request: how it was fixed (required) and what changed.
function FixModal({ ticket, onClose, onDone }) {
  const { t } = useLanguage();
  const [how, setHow] = useState("");
  const [changes, setChanges] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/change-log/${ticket.id}`, { method: "PATCH", body: { action: "done", how, changes } });
      setHow("");
      setChanges("");
      onDone();
      onClose();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={Boolean(ticket)} onClose={onClose} title={ticket ? t("erp.changes.fixTitle", { code: ticket.code }) : ""}>
      {ticket && (
        <div className="space-y-4">
          <p className="whitespace-pre-wrap rounded-xl bg-white/[0.04] p-3 text-sm text-white/75">{ticket.summary}</p>
          <div>
            <Label>{t("erp.changes.how")}</Label>
            <textarea rows={4} value={how} onChange={(e) => setHow(e.target.value)} placeholder={t("erp.changes.howHint")} className={area} />
          </div>
          <div>
            <Label>{t("erp.changes.whatChanged")}</Label>
            <textarea rows={3} value={changes} onChange={(e) => setChanges(e.target.value)} className={area} />
          </div>
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button onClick={save} loading={busy} disabled={!how.trim()}>
              {t("erp.changes.fixSave")}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// The programmer logs a change of their own (or edits one): what changed (required),
// a title and the technical details.
function LogModal({ entry, onClose, onDone }) {
  const { t } = useLanguage();
  const toast = useToast();
  const editing = Boolean(entry?.id);
  const [form, setForm] = useState({ title: "", summary: "", how: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openedFor, setOpenedFor] = useState(null);
  // Fill the form each time it opens (an edit starts from the entry).
  if (entry !== openedFor) {
    setOpenedFor(entry);
    setForm({ title: entry?.title || "", summary: entry?.summary || "", how: entry?.fix?.how || "" });
    setError("");
  }
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setBusy(true);
    setError("");
    try {
      if (editing) await api(`/api/change-log/${entry.id}`, { method: "PATCH", body: { action: "edit", ...form } });
      else await api("/api/change-log", { method: "POST", body: form });
      toast({ text: t("erp.ux.saved") });
      onDone();
      onClose();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={Boolean(entry)} onClose={onClose} title={t("erp.changes.logTitle")}>
      <div className="space-y-4">
        <Input label={t("erp.changes.title")} value={form.title} onChange={set("title")} />
        <div>
          <Label>{t("erp.changes.logSummary")}</Label>
          <textarea rows={4} value={form.summary} onChange={(e) => set("summary")(e.target.value)} className={area} />
        </div>
        <div>
          <Label>{t("erp.changes.logHow")}</Label>
          <textarea rows={3} value={form.how} onChange={(e) => set("how")(e.target.value)} className={area} />
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} loading={busy} disabled={!form.summary.trim()}>
            {editing ? t("common.save") : t("erp.changes.logSave")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
