"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, Trash2, X, XCircle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { API_DONE_EVENT } from "@/lib/clientApi";

// The dashboard's feedback layer:
//  - toasts: a short message after every action ("Saved", "Deleted"), with an optional
//    button such as Undo. Every change made through api() shows one automatically, so
//    no screen has to remember to; screens can also call useToast() themselves.
//  - confirm: a branded "are you sure" window that replaces the browser's own box.
//    `const ok = await confirm({ text, danger: true })`.
//  - ask: the same window with a text box, in place of the browser prompt.
//    `const reason = await ask({ text, label, required })` (null when cancelled).

const FeedbackContext = createContext(null);

// Requests that change nothing worth announcing (reading, previews, typing indicators…).
const QUIET = [
  /\/api\/reports\/(run|export)/,
  /\/api\/search/,
  /\/api\/messages/,
  /\/api\/conversations/,
  /\/api\/notifications/,
  /\/api\/presence/,
  /\/api\/auth\//,
  /\/api\/realtime/,
  /\/api\/uploads?/,
  /\/api\/imagekit/,
  /preview/,
  // Ticking checklist steps confirms itself on screen.
  /\/checklist/,
  // The Gantt chart keeps its own behaviour (no new messages while planning).
  /\/api\/work-projects\/(rank|fill-free-time|timeline)/,
  /\/api\/work-projects\/[^/]+\/baseline/,
  /\/api\/tasks\/[^/]+\/schedule/,
];

export function FeedbackProvider({ children }) {
  const { t } = useLanguage();
  const [toasts, setToasts] = useState([]);
  const [ask, setAsk] = useState(null);
  const [mounted, setMounted] = useState(false);
  const seq = useRef(0);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (input) => {
      const item = typeof input === "string" ? { text: input } : input;
      const id = ++seq.current;
      setToasts((list) => [...list.slice(-3), { id, tone: "success", ...item }]);
      setTimeout(() => dismiss(id), item.action ? 7000 : item.tone === "error" ? 6000 : 3200);
      return id;
    },
    [dismiss]
  );

  const confirm = useCallback(
    (input) =>
      new Promise((resolve) => {
        const opts = typeof input === "string" ? { text: input } : input;
        setAsk({ ...opts, resolve });
      }),
    []
  );
  const askText = useCallback(
    (input) =>
      new Promise((resolve) => {
        const opts = typeof input === "string" ? { text: input } : input;
        setAsk({ ...opts, input: true, resolve });
      }),
    []
  );

  useEffect(() => {
    // Portals need the document; mounting once on the client is the documented pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const onDone = (e) => {
      const { method, url } = e.detail || {};
      if (!method || method === "GET" || QUIET.some((r) => r.test(url))) return;
      toast({ text: t(method === "DELETE" ? "erp.ux.deleted" : "erp.ux.saved") });
    };
    window.addEventListener(API_DONE_EVENT, onDone);
    return () => window.removeEventListener(API_DONE_EVENT, onDone);
  }, [toast, t]);

  const answer = (value) => {
    ask?.resolve(value);
    setAsk(null);
  };

  return (
    <FeedbackContext.Provider value={{ toast, confirm, ask: askText }}>
      {children}
      {mounted &&
        createPortal(
          <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[95] flex flex-col items-center gap-2 px-4 sm:bottom-6">
            {toasts.map((x) => (
              <ToastItem key={x.id} item={x} onClose={() => dismiss(x.id)} />
            ))}
          </div>,
          document.body
        )}
      {ask && <ConfirmWindow ask={ask} onAnswer={answer} t={t} />}
    </FeedbackContext.Provider>
  );
}

function ToastItem({ item, onClose }) {
  const Icon = item.tone === "error" ? XCircle : item.tone === "info" ? Info : CheckCircle2;
  const color = item.tone === "error" ? "text-red-500" : item.tone === "info" ? "text-sky-500" : "text-emerald-500";
  return (
    <div role="status" className="toast-in pointer-events-auto flex min-w-[220px] max-w-md items-center gap-3 rounded-2xl border border-black/10 bg-[#13283a] px-4 py-3 text-sm text-[#fff] shadow-2xl">
      <Icon size={18} className={`shrink-0 ${color}`} />
      <span className="flex-1">{item.text}</span>
      {item.action && (
        <button
          type="button"
          onClick={() => {
            item.action.onClick();
            onClose();
          }}
          className="rounded-lg px-2 py-1 font-semibold text-[#f9a15a] hover:bg-[#ffffff1a]"
        >
          {item.action.label}
        </button>
      )}
      <button type="button" onClick={onClose} aria-label="close" className="rounded-full p-1 text-[#ffffff99] hover:bg-[#ffffff1a] hover:text-[#fff]">
        <X size={14} />
      </button>
    </div>
  );
}

function ConfirmWindow({ ask, onAnswer, t }) {
  const okRef = useRef(null);
  const inputRef = useRef(null);
  const [value, setValue] = useState(ask.value || "");
  // A text window answers with the text (null when cancelled); a confirm with true / false.
  const finish = (ok) => onAnswer(ask.input ? (ok ? value.trim() : null) : ok);
  const reply = useRef(finish);
  useEffect(() => {
    reply.current = finish;
  });
  useEffect(() => {
    (inputRef.current || okRef.current)?.focus();
    const onKey = (e) => e.key === "Escape" && reply.current(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const blocked = ask.input && ask.required && !value.trim();
  // kind "delete": red, with a Delete button; danger: red, with a "Yes, I'm sure" button.
  const del = ask.kind === "delete";
  const danger = del || Boolean(ask.danger);
  const Icon = del ? Trash2 : AlertTriangle;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={() => finish(false)}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onMouseDown={(e) => e.stopPropagation()}
        className="toast-in w-full max-w-sm rounded-3xl border border-white/10 bg-brand-navy p-6 text-white shadow-2xl"
      >
        <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-2xl ${danger ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"}`}>
          <Icon size={20} />
        </div>
        <h2 id="confirm-title" className="text-base font-semibold">
          {ask.title || t(danger ? "erp.ux.confirmDangerTitle" : "erp.ux.confirmTitle")}
        </h2>
        {ask.text && <p className="mt-2 text-sm leading-relaxed text-white/70">{ask.text}</p>}
        {ask.input && (
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !blocked) {
                e.preventDefault();
                finish(true);
              }
            }}
            rows={3}
            aria-label={ask.label || ask.text}
            placeholder={ask.placeholder || ""}
            className="mt-4 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none placeholder:text-white/45 focus:border-white/30"
          />
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={() => finish(false)} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold hover:bg-white/10">
            {t("common.cancel")}
          </button>
          <button
            ref={okRef}
            type="button"
            onClick={() => finish(true)}
            disabled={blocked}
            className={`rounded-xl px-4 disabled:opacity-50 py-2.5 text-sm font-semibold text-white ${danger ? "bg-red-600 hover:bg-red-500" : "bg-brand-orange hover:brightness-110"}`}
          >
            {ask.confirmLabel || t(del ? "common.delete" : ask.input ? "erp.ux.send" : "erp.ux.yesContinue")}
          </button>
        </div>
      </div>
    </div>
  );
}

const fallback = {
  toast: () => {},
  confirm: (input) => Promise.resolve(typeof window !== "undefined" && window.confirm(typeof input === "string" ? input : input?.text)),
  ask: (input) => Promise.resolve(typeof window !== "undefined" ? window.prompt(typeof input === "string" ? input : input?.text) : null),
};

export const useToast = () => (useContext(FeedbackContext) || fallback).toast;
export const useConfirm = () => (useContext(FeedbackContext) || fallback).confirm;
export const useAsk = () => (useContext(FeedbackContext) || fallback).ask;
