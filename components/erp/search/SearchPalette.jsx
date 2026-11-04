"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Briefcase, FileText, FolderKanban, Handshake, ListChecks, Search, User, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

const ICONS = { project: FolderKanban, task: ListChecks, person: User, client: Briefcase, invoice: FileText, lead: Handshake, asset: Box };

export const OPEN_SEARCH_EVENT = "erp:open-search";

// The header's search button and Ctrl / ⌘ + K (or "/"): one box for projects, tasks
// (#number), people, clients, invoices, leads and assets, and for jumping to any page the
// person can open (`pages`: [{ href, label, icon }]; shown first, also with an empty box).
export default function SearchPalette({ pages = [] }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) return undefined;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal, cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          setResults(d.results || []);
          setActive(0);
        })
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  const needle = q.trim().toLowerCase();
  const pageHits = pages
    .filter((p) => !needle || p.label.toLowerCase().includes(needle) || p.key.toLowerCase().includes(needle))
    .slice(0, needle ? 5 : 8)
    .map((p) => ({ type: "page", id: p.key, title: p.label, href: p.href, icon: p.icon }));
  const shown = [...pageHits, ...(needle.length < 2 ? [] : results)];
  function go(r) {
    setOpen(false);
    setQ("");
    setResults([]);
    router.push(r.href);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex h-10 items-center gap-2 rounded-full px-3 text-sm text-white/55 hover:bg-white/10 hover:text-white" aria-label={t("erp.search.open")}>
        <Search size={18} />
        <span className="hidden text-xs xl:inline">{t("erp.search.open")}</span>
        <kbd className="hidden rounded border border-white/15 px-1.5 text-[11px] text-white/60 xl:inline">Ctrl K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-brand-navy shadow-2xl" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t("erp.search.open")}>
            <div className="flex items-center gap-3 border-b border-white/10 px-4">
              <Search size={18} className="text-white/60" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") setActive((a) => Math.min(shown.length - 1, a + 1));
                  if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
                  if (e.key === "Enter" && shown[active]) go(shown[active]);
                }}
                placeholder={t("erp.search.placeholder")}
                aria-label={t("erp.search.placeholder")}
                className="h-14 flex-1 bg-transparent text-sm outline-none placeholder:text-white/45"
              />
              <button type="button" onClick={() => setOpen(false)} aria-label={t("common.close")} className="text-white/60 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <ul className="max-h-[50vh] overflow-y-auto p-2">
              {!needle && <li className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-white/50">{t("erp.ux.goTo")}</li>}
              {q.trim().length >= 2 && !shown.length && <li className="px-3 py-6 text-center text-sm text-white/60">{t("erp.search.none")}</li>}
              {shown.map((r, i) => {
                const Icon = r.icon || ICONS[r.type] || Search;
                return (
                  <li key={`${r.type}${r.id}`}>
                    <button type="button" onMouseEnter={() => setActive(i)} onClick={() => go(r)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start ${i === active ? "bg-white/10" : ""}`}>
                      <Icon size={16} className="shrink-0 text-white/60" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{r.title}</span>
                        {r.sub && <span className="block truncate text-xs text-white/60">{r.sub}</span>}
                      </span>
                      <span className="text-[11px] uppercase tracking-wider text-white/50">{r.type === "page" ? t("erp.ux.page") : t(`erp.search.type.${r.type}`)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-white/10 px-4 py-2.5 text-[11px] text-white/50">
              <span><kbd className="rounded border border-white/20 px-1">↑</kbd> <kbd className="rounded border border-white/20 px-1">↓</kbd> {t("erp.ux.kbMove")}</span>
              <span><kbd className="rounded border border-white/20 px-1">Enter</kbd> {t("erp.ux.kbOpen")}</span>
              <span><kbd className="rounded border border-white/20 px-1">Esc</kbd> {t("erp.ux.kbClose")}</span>
            </p>
          </div>
        </div>
      )}
    </>
  );
}
