"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarClock } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDate } from "@/lib/formatTime";
import Modal from "@/components/erp/ui/Modal";
import { Button, ErrorText, Label } from "@/components/erp/ui/fields";
import { SkeletonList } from "@/components/erp/ui/Loading";
import { StatusBadge } from "@/components/erp/tasks/TaskRow";
import { CHECK_HOURS } from "@/lib/clientChange";
import { useAsk } from "@/components/erp/ui/Feedback";

const input = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/45 focus:border-white/30 [&_option]:bg-brand-navy [&_optgroup]:bg-brand-navy";
const NEW_WORK = ["revise", "check"];

// A change the client asks for after approval: what they want, what to do with every
// task built on this one, a preview of the plan, then confirm (lib/clientChangeServer.js).
export default function ClientChange({ taskId, lookups, onClose, onDone }) {
  const { t } = useLanguage();
  const ask = useAsk();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/api/tasks/${taskId}/client-change`)
      .then((d) => {
        setData(d);
        setForm({
          summary: d.pending?.summary || "",
          hours: String(d.task.hours),
          assigneeId: d.task.assignee?.id || "",
          billing: "",
          items: Object.fromEntries(d.affected.map((a) => [a.id, { action: a.suggested, hours: String(a.hours), assigneeId: a.assignee?.id || "" }])),
        });
      })
      .catch((err) => setError(errorText(t, err)));
  }, [taskId, t]);

  // Any edit makes the preview out of date.
  const edit = (patch) => {
    setPreview(null);
    setForm((f) => ({ ...f, ...patch }));
  };
  const editItem = (id, patch) => {
    setPreview(null);
    setForm((f) => ({ ...f, items: { ...f.items, [id]: { ...f.items[id], ...patch } } }));
  };

  // Others are touched and this isn't the CEO: it goes to the CEO as a request.
  const request = data && data.affected.length > 0 && !data.canConfirm;
  const waiting = data?.pending && !data.canConfirm;
  const undecided = data && !request ? data.affected.filter((a) => !form.items[a.id].action).length : 0;

  async function send(mode, extra = {}) {
    setBusy(mode);
    setError("");
    try {
      const d = await api(`/api/tasks/${taskId}/client-change`, {
        method: "POST",
        quiet: mode === "preview",
        body: {
          mode,
          summary: form.summary,
          hours: form.hours,
          assigneeId: form.assigneeId,
          billing: form.billing,
          items: data.affected.map((a) => ({ taskId: a.id, status: a.status, ...form.items[a.id] })),
          ...extra,
        },
      });
      if (mode === "preview") setPreview(d);
      else onDone(d);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy("");
    }
  }

  const who = (value, onChange) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={t("erp.tasks.assignee")} className={input}>
      {!lookups.people.some((p) => p.id === value) && <option value={value}>—</option>}
      {lookups.people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
  const hoursInput = (value, onChange) => <input type="number" min="0.5" step="0.5" value={value} onChange={(e) => onChange(e.target.value)} aria-label={t("erp.clientChange.hours")} dir="ltr" className={`${input} w-24`} />;

  return (
    <Modal open onClose={onClose} title={t("erp.clientChange.title")} wide>
      <div className="space-y-5">
        {!data && !error && <SkeletonList rows={4} avatar={false} />}
        {waiting && <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-200">{t("erp.clientChange.waitingCeo", { code: data.pending.code })}</p>}
        {data && form && !waiting && (
          <>
            {data.pending && <p className="rounded-xl bg-sky-500/10 px-4 py-3 text-sm text-sky-200">{t("erp.clientChange.fromManager", { code: data.pending.code })}</p>}
            <div>
              <Label>{t("erp.clientChange.summary")}</Label>
              <textarea rows={3} value={form.summary} onChange={(e) => edit({ summary: e.target.value })} className={input} />
            </div>

            {!request && data.canSetHours && (
              <div className="rounded-xl border border-white/10 p-3">
                <p className="mb-2 text-sm">
                  #{data.task.number} · {data.task.title}
                </p>
                <div className="flex gap-2">
                  {hoursInput(form.hours, (hours) => edit({ hours }))}
                  {who(form.assigneeId, (assigneeId) => edit({ assigneeId }))}
                </div>
              </div>
            )}

            {data.affected.length === 0 && <p className="text-sm text-emerald-200">{t("erp.clientChange.noneAffected")}</p>}
            {data.affected.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">{t("erp.clientChange.affected", { n: data.affected.length })}</p>
                {request && <p className="text-xs text-white/60">{t("erp.clientChange.requestHint")}</p>}
                {data.affected.map((a) => {
                  const item = form.items[a.id];
                  return (
                    <div key={a.id} className={`rounded-xl border p-3 ${!request && !item.action ? "border-amber-400/50 bg-amber-500/5" : "border-white/10"}`}>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span dir="ltr" className="text-xs text-white/55">
                          #{a.number}
                        </span>
                        <span className="min-w-0 flex-1">{a.title}</span>
                        <span className="text-xs text-white/60">{a.assignee?.name}</span>
                        <StatusBadge status={a.status} />
                      </div>
                      {!request && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {a.actions.map((k) => (
                            <button
                              key={k}
                              type="button"
                              onClick={() => editItem(a.id, { action: k, hours: String(k === "check" ? CHECK_HOURS : a.hours) })}
                              className={`rounded-lg px-3 py-1.5 text-xs ${item.action === k ? "bg-brand-orange text-white" : "bg-white/5 text-white/65 hover:text-white"}`}
                            >
                              {t(`erp.clientChange.action.${k}`)}
                            </button>
                          ))}
                        </div>
                      )}
                      {!request && NEW_WORK.includes(item.action) && (
                        <div className="mt-2 flex gap-2">
                          {hoursInput(item.hours, (hours) => editItem(a.id, { hours }))}
                          {who(item.assigneeId, (assigneeId) => editItem(a.id, { assigneeId }))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!request && data.canConfirm && (
              <div>
                <Label>{t("erp.clientChange.billing")}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {["", "free", "paid"].map((k) => (
                    <button key={k || "later"} type="button" onClick={() => setForm((f) => ({ ...f, billing: k }))} className={`rounded-lg px-3 py-1.5 text-xs ${form.billing === k ? "bg-brand-orange text-white" : "bg-white/5 text-white/65"}`}>
                      {t(`erp.clientChange.bill.${k || "later"}`)}
                    </button>
                  ))}
                </div>
                {form.billing === "paid" && <p className="mt-1 text-xs text-white/55">{t("erp.clientChange.paidHint")}</p>}
              </div>
            )}

            {preview && <Preview p={preview} />}
          </>
        )}
        <ErrorText>{error}</ErrorText>
        {data && form && !waiting && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {undecided > 0 && <span className="me-auto text-xs text-amber-200">{t("erp.clientChange.undecided", { n: undecided })}</span>}
            {data.pending && data.canConfirm && (
              <Button
                variant="danger"
                loading={busy === "decline"}
                onClick={async () => {
                  const reason = await ask({ text: t("erp.clientChange.declineAsk"), required: true });
                  if (reason) send("decline", { reason });
                }}
              >
                {t("erp.clientChange.decline")}
              </Button>
            )}
            {request ? (
              <Button loading={busy === "request"} disabled={!form.summary.trim()} onClick={() => send("request")}>
                {t("erp.clientChange.sendRequest")}
              </Button>
            ) : preview ? (
              <Button loading={busy === "apply"} onClick={() => send("apply")}>
                {t("erp.clientChange.confirm")}
              </Button>
            ) : (
              <Button loading={busy === "preview"} disabled={!form.summary.trim() || undecided > 0} onClick={() => send("preview")}>
                {t("erp.clientChange.preview")}
              </Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Preview({ p }) {
  const { t, lang } = useLanguage();
  const day = (d) => (d ? formatDate(d, lang) : "—");
  return (
    <div className="space-y-4 rounded-2xl border border-brand-orange/30 bg-brand-orange/[0.06] p-4 text-sm">
      <p className="font-semibold">{t("erp.clientChange.previewTitle")}</p>
      <p>{t("erp.clientChange.extra", { n: p.created.length, h: p.extraHours })}</p>
      <ul className="space-y-1 text-xs text-white/80">
        {p.created.map((c) => (
          <li key={`${c.number}-${c.check}`} className="flex flex-wrap gap-x-3">
            <b>
              {c.check ? t("erp.clientChange.action.check") : `R-${String(c.revision).padStart(2, "0")}`} · #{c.number} {c.title}
            </b>
            <span>{c.assignee}</span>
            <span>{t("erp.clientChange.hoursN", { h: c.hours })}</span>
            <span>
              {day(c.start)} – {day(c.end)}
            </span>
          </li>
        ))}
      </ul>
      {p.deliveries.map((d, i) => (
        <p key={i} className="flex flex-wrap items-center gap-2 text-xs">
          <CalendarClock size={14} /> {d.name?.[lang] || d.name?.en}: {day(d.from)} <ArrowRight size={12} className="rtl:rotate-180" /> <b className={d.to > d.from ? "text-red-300" : "text-emerald-300"}>{day(d.to)}</b>
        </p>
      ))}
      <div>
        <p className="mb-1 text-xs font-semibold">{t("erp.clientChange.moved", { n: p.moves.length })}</p>
        <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-white/70">
          {p.moves.map((m) => (
            <li key={m.number}>
              {m.assignee} · #{m.number} {m.title}: {day(m.from)} ← → {day(m.to)}
            </li>
          ))}
        </ul>
      </div>
      {p.reopens && (
        <p className="flex items-center gap-2 text-xs text-amber-200">
          <AlertTriangle size={14} /> {t("erp.clientChange.reopens")}
        </p>
      )}
      {p.paused > 0 && <p className="text-xs text-white/55">{t("erp.clientChange.pausedHint")}</p>}
    </div>
  );
}
