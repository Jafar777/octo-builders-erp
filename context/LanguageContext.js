"use client";

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import translations from "@/lib/i18n/translations";

const LanguageContext = createContext(null);

// The server reads the language from this cookie to send people's names in it.
function persistLang(lang) {
  try {
    window.localStorage.setItem("octa_lang", lang);
  } catch {}
  document.cookie = `octa_lang=${lang}; path=/; max-age=31536000; samesite=lax`;
}

const cookieLang = () => document.cookie.match(/(?:^|; )octa_lang=(ar|en)/)?.[1];
// Dashboard data (names) was loaded in the old language, so it is reloaded.
const inDashboard = () => window.location.pathname.startsWith("/dashboard");

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
    const lang = stored === "en" ? "en" : "ar";
    if (cookieLang() !== lang) {
      persistLang(lang);
      // First visit since names follow the language: reload once with the cookie set.
      if (stored === "en" && inDashboard()) window.location.reload();
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = useCallback((next) => {
    const value = next === "ar" ? "ar" : "en";
    persistLang(value);
    if (inDashboard() && value !== lang) return window.location.reload();
    setLangState(value);
  }, [lang]);

  const toggleLang = useCallback(() => setLang(lang === "ar" ? "en" : "ar"), [lang, setLang]);

  // t("a.b", { name: "x" }) replaces {name} in the translation.
  const t = useCallback(
    (key, vars) => {
      const value = getFromPath(translations[lang], key);
      if (value === undefined) return key;
      if (!vars || typeof value !== "string") return value;
      return value.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
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
