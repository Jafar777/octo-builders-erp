"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Keyboard, LayoutGrid, ListChecks, Moon, Search, Star, Sun } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import Modal from "@/components/erp/ui/Modal";
import { OPEN_SEARCH_EVENT } from "@/components/erp/search/SearchPalette";

// Keyboard shortcuts: "g" then a letter jumps to a page, "/" opens search, "?" lists them.
// Only pages the person can open are offered.
export const JUMPS = [
  { key: "h", page: "overview" },
  { key: "t", page: "tasks" },
  { key: "p", page: "projects" },
  { key: "a", page: "attendance" },
  { key: "m", page: "messages" },
  { key: "n", page: "notifications" },
  { key: "r", page: "reviews" },
  { key: "f", page: "finance" },
  { key: "s", page: "staff" },
  { key: "o", page: "profile" },
];

const typing = (el) => el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

export function useShortcuts({ pages, onHelp }) {
  const router = useRouter();
  const pending = useRef(0);
  const help = useRef(onHelp);
  useEffect(() => {
    help.current = onHelp;
  }, [onHelp]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(document.activeElement) || document.querySelector('[aria-modal="true"]')) return;
      if (e.key === "?") {
        e.preventDefault();
        help.current?.();
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
        return;
      }
      if (e.key.toLowerCase() === "g") {
        pending.current = Date.now();
        return;
      }
      if (Date.now() - pending.current < 1200) {
        pending.current = 0;
        const jump = JUMPS.find((j) => j.key === e.key.toLowerCase());
        const page = jump && pages.find((p) => p.key === jump.page);
        if (page) {
          e.preventDefault();
          router.push(page.href);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pages, router]);
}

function Keys({ children }) {
  return <kbd className="inline-flex min-w-7 items-center justify-center rounded-lg border border-white/20 bg-white/5 px-2 py-0.5 font-mono text-xs">{children}</kbd>;
}

export function ShortcutsHelp({ open, onClose, pages, onGuide }) {
  const { t } = useLanguage();
  const jumps = JUMPS.map((j) => ({ ...j, item: pages.find((p) => p.key === j.page) })).filter((j) => j.item);
  return (
    <Modal open={open} onClose={onClose} title={t("erp.ux.shortcutsTitle")}>
      <div className="space-y-5 text-sm">
        <ul className="space-y-2.5">
          <li className="flex items-center justify-between gap-3">
            <span>{t("erp.ux.scSearch")}</span>
            <span className="flex gap-1">
              <Keys>/</Keys> <span className="text-white/50">{t("erp.ux.or")}</span> <Keys>Ctrl</Keys>
              <Keys>K</Keys>
            </span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span>{t("erp.ux.scHelp")}</span>
            <Keys>?</Keys>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span>{t("erp.ux.scClose")}</span>
            <Keys>Esc</Keys>
          </li>
        </ul>
        {jumps.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/55">{t("erp.ux.scJump")}</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {jumps.map((j) => (
                <li key={j.key} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-3 py-2">
                  <span className="truncate">{j.item.label}</span>
                  <span className="flex gap-1">
                    <Keys>G</Keys>
                    <Keys>{j.key.toUpperCase()}</Keys>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <button type="button" onClick={onGuide} className="text-sm font-medium text-brand-orange hover:underline">
          {t("erp.ux.replayGuide")}
        </button>
      </div>
    </Modal>
  );
}

// The first-day guide: a few short cards on how the dashboard works, shown once.
export function WelcomeGuide({ open, onDone, user, pages }) {
  const { t } = useLanguage();
  const [step, setStep] = useState(0);
  const has = (key) => pages.some((p) => p.key === key);
  const steps = [
    { icon: LayoutGrid, title: t("erp.ux.g1Title", { name: user.firstName || user.name || "" }), text: t("erp.ux.g1Text") },
    has("tasks") && { icon: ListChecks, title: t("erp.ux.g2Title"), text: t("erp.ux.g2Text") },
    has("attendance") && { icon: CalendarClock, title: t("erp.ux.g3Title"), text: t("erp.ux.g3Text") },
    { icon: Search, title: t("erp.ux.g4Title"), text: t("erp.ux.g4Text") },
    { icon: Star, title: t("erp.ux.g5Title"), text: t("erp.ux.g5Text") },
  ].filter(Boolean);
  const s = steps[Math.min(step, steps.length - 1)];
  const last = step >= steps.length - 1;
  const finish = () => {
    setStep(0);
    onDone();
  };
  return (
    <Modal open={open} onClose={finish} title={t("erp.ux.guideTitle")}>
      <div className="space-y-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-orange/15 text-brand-orange">
          <s.icon size={26} />
        </div>
        <div>
          <h3 className="text-lg font-semibold">{s.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-white/70">{s.text}</p>
        </div>
        <div className="flex items-center gap-1.5" aria-hidden>
          {steps.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-brand-orange" : "w-1.5 bg-white/20"}`} />
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={finish} className="text-sm text-white/60 hover:text-white">
            {t("erp.ux.skip")}
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button type="button" onClick={() => setStep(step - 1)} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold hover:bg-white/10">
                {t("erp.ux.back")}
              </button>
            )}
            <button type="button" onClick={() => (last ? finish() : setStep(step + 1))} className="rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-semibold text-white">
              {last ? t("erp.ux.start") : t("erp.ux.next")}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function ThemeButton({ theme, onChange }) {
  const { t } = useLanguage();
  const light = theme === "light";
  return (
    <button
      type="button"
      onClick={() => onChange(light ? "dark" : "light")}
      title={t(light ? "erp.ux.themeDark" : "erp.ux.themeLight")}
      aria-label={t(light ? "erp.ux.themeDark" : "erp.ux.themeLight")}
      className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
    >
      {light ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
}

export function ShortcutsButton({ onClick }) {
  const { t } = useLanguage();
  return (
    <button type="button" onClick={onClick} title={t("erp.ux.shortcutsTitle")} aria-label={t("erp.ux.shortcutsTitle")} className="hidden h-10 w-10 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white md:flex">
      <Keyboard size={18} />
    </button>
  );
}
