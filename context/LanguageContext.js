"use client";

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import translations from "@/lib/i18n/translations";

const LanguageContext = createContext(null);

function getFromPath(obj, path) {
  return path.split(".").reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState("ar");

  useEffect(() => {
    // Read the persisted preference after mount only, so the server-rendered Arabic
    // default matches the client's first paint and there is no hydration mismatch.
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("octa_lang") : null;
    if (stored === "ar" || stored === "en") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLangState(stored);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    try {
      window.localStorage.setItem("octa_lang", lang);
    } catch {}
  }, [lang]);

  const setLang = useCallback((next) => {
    setLangState(next === "ar" ? "ar" : "en");
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => (prev === "ar" ? "en" : "ar"));
  }, []);

  const t = useCallback(
    (key) => {
      const value = getFromPath(translations[lang], key);
      return value !== undefined ? value : key;
    },
    [lang]
  );

  const value = useMemo(
    () => ({ lang, setLang, toggleLang, t, dir: lang === "ar" ? "rtl" : "ltr" }),
    [lang, setLang, toggleLang, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
