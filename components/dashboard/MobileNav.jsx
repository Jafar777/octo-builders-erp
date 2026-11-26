"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { LayoutGrid, LogOut, Moon, Sun, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import Avatar from "@/components/erp/ui/Avatar";

// Phones: the app's own navigation — a tab bar at the bottom (the person's most used
// pages, with their badges) and "More", a sheet with every page, their profile and the
// quick settings (theme, language, view as). Hidden on large screens, where the sidebar is.

// The tabs: the first of these the person can open, in this order; "More" is always last.
const TAB_ORDER = [["overview"], ["taskMenu", "tasks", "teamTasks", "reviews", "taskLog"], ["projects", "intake"], ["messages"], ["orders"], ["notifications"]];
const MAX_TABS = 4;

export function pickTabs(entries) {
  const byKey = Object.fromEntries(entries.map((e) => [e.key, e]));
  const out = [];
  for (const keys of TAB_ORDER) {
    const hit = keys.map((k) => byKey[k]).find(Boolean);
    if (hit && !out.includes(hit)) out.push(hit);
    if (out.length === MAX_TABS) break;
  }
  return out;
}

function Badge({ n, className = "" }) {
  if (!n) return null;
  return <span className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-orange px-1 text-[10px] font-bold leading-none text-white ring-2 ring-brand-navy ${className}`}>{n > 99 ? "99+" : n}</span>;
}

export function BottomTabs({ tabs, isActive, badgeOf, onMore, moreOpen, moreBadge }) {
  const { t } = useLanguage();
  const anyActive = tabs.some(isActive);
  return (
    <nav
      aria-label={t("mobile.tabs")}
      className="erp-tabbar fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-brand-navy pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto flex max-w-xl items-stretch">
        {tabs.map((tab) => {
          const active = isActive(tab) && !moreOpen;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1 text-[10.5px] font-medium transition-colors active:scale-95 ${active ? "text-brand-orange" : "text-white/55"}`}
            >
              {active && <motion.span layoutId="tab-pill" className="absolute top-0 h-[3px] w-8 rounded-b-full bg-brand-orange" />}
              <span className="relative">
                <Icon size={22} strokeWidth={active ? 2.3 : 1.8} />
                <Badge n={badgeOf(tab)} className="absolute -end-2.5 -top-1.5" />
              </span>
              <span className="max-w-full truncate">{t(`erp.nav.${tab.key}`)}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onMore}
          aria-expanded={moreOpen}
          className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1 text-[10.5px] font-medium active:scale-95 ${moreOpen || (!anyActive && !moreOpen) ? "text-brand-orange" : "text-white/55"}`}
        >
          {(moreOpen || !anyActive) && <span className="absolute top-0 h-[3px] w-8 rounded-b-full bg-brand-orange" />}
          <span className="relative">
            <LayoutGrid size={22} strokeWidth={moreOpen ? 2.3 : 1.8} />
            <Badge n={moreBadge} className="absolute -end-2.5 -top-1.5" />
          </span>
          <span>{t("mobile.more")}</span>
        </button>
      </div>
    </nav>
  );
}

// Every page as an app grid, grouped like the sidebar, with the person on top.
export function MoreSheet({ open, onClose, groups, pinned, isActive, badgeOf, user, theme, onTheme, onLogout, extras }) {
  const { t, lang } = useLanguage();
  // The page behind doesn't scroll while the sheet is open.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const tile = (link) => {
    const Icon = link.icon;
    const active = isActive(link);
    return (
      <Link
        key={link.key}
        href={link.href}
        onClick={onClose}
        className={`relative flex flex-col items-center gap-1.5 rounded-2xl px-1 py-3 text-center text-[11.5px] leading-tight transition active:scale-95 ${active ? "bg-brand-orange/15 text-white" : "text-white/80 active:bg-white/10"}`}
      >
        <span className={`relative flex h-12 w-12 items-center justify-center rounded-2xl ${active ? "bg-brand-orange text-white" : "bg-white/[0.07] text-white/85"}`}>
          <Icon size={22} />
          <Badge n={badgeOf(link)} className="absolute -end-1.5 -top-1.5" />
        </span>
        <span className="line-clamp-2">{t(`erp.nav.${link.key}`)}</span>
      </Link>
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm lg:hidden" />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t("mobile.more")}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => (info.offset.y > 120 || info.velocity.y > 600) && onClose()}
            className="fixed inset-x-0 bottom-0 z-[61] flex max-h-[88dvh] flex-col rounded-t-[28px] border-t border-white/10 bg-brand-navy pb-[env(safe-area-inset-bottom)] shadow-2xl lg:hidden"
          >
            <div className="flex justify-center pb-1 pt-2.5">
              <span className="h-1.5 w-10 rounded-full bg-white/20" />
            </div>
            <div className="flex items-center gap-3 px-5 pb-3 pt-1">
              <Link href="/dashboard/profile" onClick={onClose} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={user.name || user.email} src={user.avatarUrl} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{user.name || user.email}</span>
                  <span className="block truncate text-xs text-white/55">{user.roleName?.[lang] || user.role}</span>
                </span>
              </Link>
              <button type="button" onClick={onClose} aria-label={t("common.close")} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.07] text-white/70">
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
              {pinned.length > 0 && (
                <section className="mb-2">
                  <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/45">{t("erp.ux.pinned")}</p>
                  <div className="grid grid-cols-4 gap-1">{pinned.map(tile)}</div>
                </section>
              )}
              {groups.map((g) => (
                <section key={g.group} className="mb-2">
                  <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-white/45">{t(`erp.nav.group_${g.group}`)}</p>
                  <div className="grid grid-cols-4 gap-1">{g.items.map(tile)}</div>
                </section>
              ))}
              <section className="mt-3 space-y-2 border-t border-white/10 px-2 pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onTheme(theme === "light" ? "dark" : "light")}
                    className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-white/[0.07] px-3 text-sm active:scale-[0.98]"
                  >
                    {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
                    {t(theme === "light" ? "mobile.dark" : "mobile.light")}
                  </button>
                  {extras}
                </div>
                <button type="button" onClick={onLogout} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-red-400 active:bg-red-500/10">
                  <LogOut size={17} /> {t("nav.logout")}
                </button>
              </section>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}


// Phones: the chosen tab in a swipeable tab row (globals.css) slides into view, on
// opening a page and whenever the tab changes.
export function useActiveTabIntoView(pathname) {
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia("(min-width: 1024px)").matches) return undefined;
    const main = document.querySelector("main");
    if (!main) return undefined;
    let timer = null;
    const reveal = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        for (const el of main.querySelectorAll('[data-active="true"], [role="tab"][aria-selected="true"]')) {
          const row = el.parentElement;
          if (!row || row.scrollWidth <= row.clientWidth + 1) continue;
          const pr = row.getBoundingClientRect();
          const r = el.getBoundingClientRect();
          if (r.left < pr.left) row.scrollBy({ left: r.left - pr.left - 16, behavior: "smooth" });
          else if (r.right > pr.right) row.scrollBy({ left: r.right - pr.right + 16, behavior: "smooth" });
        }
      }, 80);
    };
    reveal();
    const observer = new MutationObserver(reveal);
    observer.observe(main, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-active", "aria-selected"] });
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [pathname]);
}
