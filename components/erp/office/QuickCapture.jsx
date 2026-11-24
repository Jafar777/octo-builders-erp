"use client";

import { useEffect, useRef, useState } from "react";
import { AlertOctagon, ArrowDownToLine, ArrowUpFromLine, CalendarPlus, ListTodo, Phone, Send, Sparkles, Wrench } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { useToast } from "@/components/erp/ui/Feedback";
import { CHANNELS } from "@/lib/office";
import { DueChips, inputCls, PickSelect, TargetSelect } from "@/components/erp/office/officeUi";

const TYPES = [
  { key: "call", icon: Phone },
  { key: "followup", icon: ListTodo },
  { key: "request", icon: Send },
  { key: "complaint", icon: AlertOctagon },
  { key: "issue", icon: Wrench },
  { key: "meeting", icon: CalendarPlus },
  { key: "incoming", icon: ArrowDownToLine },
  { key: "outgoing", icon: ArrowUpFromLine },
  { key: "inquiry", icon: Sparkles },
];
const SOURCES = ["referral", "website", "social", "walk_in", "repeat", "other"];
const blank = { text: "", details: "", client: "", project: "", person: "", department: "", due: "", priority: "normal", channel: "call_in", callback: false, nextStep: "", contactName: "", contactPhone: "", source: "other", time: "10:00", link: "" };

// The office's quick capture (POST /api/office/capture): pick what it is, type one line,
// Enter. The few extras each type needs sit in one row under it.
export default function QuickCapture({ lookup, onSaved, autoFocus = false }) {
  const { t } = useLanguage();
  const toast = useToast();
  const [type, setType] = useState("call");
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const textRef = useRef(null);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (autoFocus) textRef.current?.focus();
  }, [autoFocus]);

  // Alt+1…9 picks a type from anywhere on the page.
  useEffect(() => {
    const onKey = (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= TYPES.length) {
        e.preventDefault();
        setType(TYPES[n - 1].key);
        textRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function save() {
    if (!f.text.trim() || busy) return;
    if (type === "request" && !f.person && !f.department) return setError(t("errors.office_request_target"));
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/office/capture", { method: "POST", body: { type, ...f }, quiet: true });
      toast(r.ref ? t("erp.office.capture.savedRef", { ref: r.ref }) : t(`erp.office.capture.saved.${type}`));
      // Keep the client / project for the next line (calls about the same client come in a row).
      setF((x) => ({ ...blank, client: x.client, project: x.project, channel: x.channel }));
      onSaved?.(r);
      textRef.current?.focus();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  const about = (
    <>
      <PickSelect value={f.client} onChange={set("client")} list={lookup.clients} placeholder={t("erp.office.pick.client")} className="sm:w-48" />
      <PickSelect value={f.project} onChange={set("project")} list={lookup.projects} placeholder={t("erp.office.pick.project")} className="sm:w-48" />
    </>
  );
  const priority = (
    <select value={f.priority} onChange={(e) => set("priority")(e.target.value)} aria-label={t("erp.office.priorityLabel")} className={`${inputCls} sm:w-32`}>
      {["normal", "high", "urgent"].map((p) => (
        <option key={p} value={p}>
          {t(`erp.office.priority.${p}`)}
        </option>
      ))}
    </select>
  );

  return (
    <div className="rounded-2xl border border-brand-orange/30 bg-gradient-to-br from-brand-orange/[0.08] to-transparent p-4">
      <div className="mb-3 flex flex-wrap gap-1">
        {TYPES.map(({ key, icon: Icon }, i) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setType(key);
              setError("");
              textRef.current?.focus();
            }}
            title={`Alt+${i + 1}`}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${type === key ? "bg-brand-orange text-white" : "bg-white/5 text-white/65 hover:bg-white/10 hover:text-white"}`}
          >
            <Icon size={14} />
            {t(`erp.office.capture.type.${key}`)}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex gap-2"
      >
        <input
          ref={textRef}
          value={f.text}
          onChange={(e) => set("text")(e.target.value)}
          placeholder={t(`erp.office.capture.placeholder.${type}`)}
          aria-label={t(`erp.office.capture.placeholder.${type}`)}
          maxLength={300}
          className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-brand-orange/60"
        />
        <button type="submit" disabled={busy || !f.text.trim()} className="rounded-xl bg-brand-orange px-5 text-sm font-semibold text-white disabled:opacity-50">
          {t("erp.office.capture.save")}
        </button>
      </form>

      <div className="mt-3 flex flex-col flex-wrap gap-2 sm:flex-row sm:items-center">
        {type === "call" && (
          <>
            <select value={f.channel} onChange={(e) => set("channel")(e.target.value)} aria-label={t("erp.office.channelLabel")} className={`${inputCls} sm:w-40`}>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {t(`erp.office.channel.${c}`)}
                </option>
              ))}
            </select>
            <PickSelect value={f.client} onChange={set("client")} list={lookup.clients} placeholder={t("erp.office.pick.client")} className="sm:w-48" />
            {!f.client && (
              <>
                <input value={f.contactName} onChange={(e) => set("contactName")(e.target.value)} placeholder={t("erp.office.contactName")} className={`${inputCls} sm:w-40`} />
                <input value={f.contactPhone} onChange={(e) => set("contactPhone")(e.target.value)} placeholder={t("erp.office.contactPhone")} dir="ltr" className={`${inputCls} sm:w-36`} />
              </>
            )}
            <label className="flex items-center gap-2 text-xs text-white/70">
              <input type="checkbox" checked={f.callback} onChange={(e) => set("callback")(e.target.checked)} className="accent-[#f68b1f]" />
              {t("erp.office.callbackNeeded")}
            </label>
            <input value={f.nextStep} onChange={(e) => set("nextStep")(e.target.value)} placeholder={t("erp.office.nextStep")} className={`${inputCls} sm:flex-1`} />
            {f.nextStep && <DueChips value={f.due} onChange={set("due")} allowNone={false} />}
          </>
        )}
        {(type === "followup" || type === "complaint" || type === "issue") && (
          <>
            {about}
            {type !== "followup" && <TargetSelect person={f.person} department={f.department} onChange={(v) => setF((x) => ({ ...x, ...v }))} lookup={lookup} placeholder={t("erp.office.pick.targetOptional")} className="sm:w-52" />}
            {priority}
            <DueChips value={f.due} onChange={set("due")} />
          </>
        )}
        {type === "request" && (
          <>
            <TargetSelect person={f.person} department={f.department} onChange={(v) => setF((x) => ({ ...x, ...v }))} lookup={lookup} placeholder={t("erp.office.pick.target")} className="sm:w-52" />
            {about}
            {priority}
            <DueChips value={f.due} onChange={set("due")} />
          </>
        )}
        {type === "meeting" && (
          <>
            <DueChips value={f.due || "today"} onChange={set("due")} allowNone={false} />
            <input type="time" value={f.time} onChange={(e) => set("time")(e.target.value)} aria-label={t("erp.office.time")} className={`${inputCls} w-28 [color-scheme:dark]`} />
            <PickSelect value={f.person} onChange={set("person")} list={lookup.people} placeholder={t("erp.office.pick.participant")} className="sm:w-48" />
            <PickSelect value={f.client} onChange={set("client")} list={lookup.clients} placeholder={t("erp.office.pick.client")} className="sm:w-48" />
          </>
        )}
        {(type === "incoming" || type === "outgoing") && (
          <>
            <input value={f.contactName} onChange={(e) => set("contactName")(e.target.value)} placeholder={t(type === "incoming" ? "erp.office.from" : "erp.office.to")} className={`${inputCls} sm:w-48`} />
            <input value={f.link} onChange={(e) => set("link")(e.target.value)} placeholder={t("erp.office.linkPlaceholder")} dir="ltr" className={`${inputCls} sm:flex-1`} />
            {about}
          </>
        )}
        {type === "inquiry" && (
          <>
            <input value={f.contactName} onChange={(e) => set("contactName")(e.target.value)} placeholder={t("erp.office.contactName")} className={`${inputCls} sm:w-44`} />
            <input value={f.contactPhone} onChange={(e) => set("contactPhone")(e.target.value)} placeholder={t("erp.office.contactPhone")} dir="ltr" className={`${inputCls} sm:w-40`} />
            <select value={f.source} onChange={(e) => set("source")(e.target.value)} aria-label={t("erp.office.source")} className={`${inputCls} sm:w-40`}>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {t(`erp.sales.sources.${s}`)}
                </option>
              ))}
            </select>
          </>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}
