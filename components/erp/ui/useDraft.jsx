"use client";

import { useEffect, useRef, useState } from "react";
import { History, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

// Keeps a copy of a long form on this device while it is being filled, so a closed tab,
// a lost connection or a mis-click never loses the work. When the same form is opened
// again, a bar offers to bring the draft back.
//   const draft = useDraft("intake-new", form, setForm);
//   <DraftBar draft={draft} />   …   after a successful save: draft.clear()
const PREFIX = "erp.draft.";

const read = (key) => {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export function useDraft(key, value, setValue, { enabled = true } = {}) {
  const [saved, setSaved] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const first = useRef(JSON.stringify(value));
  const touched = useRef(false);

  // An older draft for this form, read once the page is in the browser.
  useEffect(() => {
    if (!enabled) return;
    const d = read(key);
    if (d && JSON.stringify(d.value) !== first.current) setSaved(d);
  }, [key, enabled]);

  // Save a second after typing stops (only once something was changed).
  useEffect(() => {
    if (!enabled) return undefined;
    const text = JSON.stringify(value);
    if (!touched.current && text === first.current) return undefined;
    touched.current = true;
    const timer = setTimeout(() => {
      try {
        const at = new Date().toISOString();
        window.localStorage.setItem(PREFIX + key, JSON.stringify({ value, at }));
        setSavedAt(at);
      } catch {}
    }, 800);
    return () => clearTimeout(timer);
  }, [key, value, enabled]);

  return {
    offer: saved,
    savedAt,
    restore: () => {
      if (saved) setValue(saved.value);
      setSaved(null);
    },
    dismiss: () => {
      setSaved(null);
      try {
        window.localStorage.removeItem(PREFIX + key);
      } catch {}
    },
    clear: () => {
      touched.current = false;
      try {
        window.localStorage.removeItem(PREFIX + key);
      } catch {}
    },
  };
}

export function DraftBar({ draft }) {
  const { t, lang } = useLanguage();
  if (!draft.offer && !draft.savedAt) return null;
  const time = (iso) => new Date(iso).toLocaleTimeString(lang === "ar" ? "ar" : "en-GB", { hour: "2-digit", minute: "2-digit" });
  if (!draft.offer) return <p className="text-xs text-white/55">{t("erp.ux.draftSaved", { time: time(draft.savedAt) })}</p>;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm">
      <History size={16} className="text-sky-300" />
      <span className="flex-1">{t("erp.ux.draftFound", { time: new Date(draft.offer.at).toLocaleString(lang === "ar" ? "ar" : "en-GB", { dateStyle: "medium", timeStyle: "short" }) })}</span>
      <button type="button" onClick={draft.restore} className="rounded-lg bg-sky-500 px-3 py-1.5 font-semibold text-white">
        {t("erp.ux.draftRestore")}
      </button>
      <button type="button" onClick={draft.dismiss} aria-label={t("erp.ux.draftDiscard")} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-white/70 hover:bg-white/10">
        <X size={14} /> {t("erp.ux.draftDiscard")}
      </button>
    </div>
  );
}
