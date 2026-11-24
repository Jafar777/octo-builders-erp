"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/clientApi";
import { appearanceStyle, cleanAppearance, effectiveAppearance } from "@/lib/appearance";

const Ctx = createContext(null);

// The dashboard's look for the person signed in (lib/appearance.js), held by the
// dashboard frame. The Appearance page edits a draft that shows live everywhere until
// it's saved or dropped.
//   mine:    their own saved look (null = the company default)
//   company: the CEO's default for everyone
export function AppearanceProvider({ initialMine, initialCompany, legacyTheme, actingAs, children }) {
  const [mine, setMine] = useState(initialMine || null);
  const [company, setCompany] = useState(initialCompany || null);
  const [draft, setDraft] = useState(null);

  const saved = useMemo(() => effectiveAppearance(mine, company, legacyTheme), [mine, company, legacyTheme]);
  const appearance = draft || saved;

  // scope "me" | "company"; value null = back to the default.
  const save = useCallback(
    async (scope, value) => {
      const clean = value ? cleanAppearance(value) : null;
      // Viewing as someone (the CEO) never changes that person's screens.
      if (scope === "me" && actingAs) {
        setDraft(null);
        return;
      }
      await api("/api/appearance", { method: "PUT", body: { scope, appearance: clean } });
      if (scope === "me") setMine(clean);
      else setCompany(clean);
      setDraft(null);
    },
    [actingAs]
  );

  // The sun / moon button: the same look in its light or dark palette.
  const setMode = useCallback(
    (mode) => {
      const next = { ...saved, mode };
      setMine(next);
      if (!actingAs) api("/api/appearance", { method: "PUT", body: { scope: "me", appearance: next }, quiet: true }).catch(() => {});
    },
    [saved, actingAs]
  );

  const value = useMemo(
    () => ({ appearance, saved, mine, company, draft, setDraft, save, setMode, actingAs: Boolean(actingAs) }),
    [appearance, saved, mine, company, draft, save, setMode, actingAs]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAppearance = () => useContext(Ctx);

// The page colour behind the background animation (lib/appearance.js).
export { pageColor } from "@/lib/appearance";

// Puts the look on <html> too (pop-ups outside the dashboard frame, and the text size,
// which every rem follows), and takes it off when the dashboard closes.
export function useHtmlAppearance(appearance, dir) {
  useEffect(() => {
    const root = document.documentElement;
    const style = appearanceStyle(appearance, dir);
    const keys = Object.keys(style).filter((k) => k.startsWith("--"));
    for (const k of keys) root.style.setProperty(k, style[k]);
    root.style.fontSize = `${appearance.font.size}%`;
    root.classList.toggle("erp-still", !appearance.effects.motion);
    return () => {
      for (const k of keys) root.style.removeProperty(k);
      root.style.fontSize = "";
      root.classList.remove("erp-still");
    };
  }, [appearance, dir]);
}
