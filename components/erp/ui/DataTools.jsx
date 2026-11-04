"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Download, Inbox, Minus, Search, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

// Shared table tools: click a column to sort (remembered per table on this device),
// quick search, ticking rows for bulk actions, "show more" paging, CSV export that
// opens in Excel (Arabic included), and a friendly empty state.

const read = (key, fallback) => {
  try {
    const v = key && window.localStorage.getItem(`erp.table.${key}`);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    if (key) window.localStorage.setItem(`erp.table.${key}`, JSON.stringify(value));
  } catch {}
};

const compare = (a, b) => {
  const empty = (v) => v === null || v === undefined || v === "";
  if (empty(a) && empty(b)) return 0;
  if (empty(a)) return 1;
  if (empty(b)) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (a instanceof Date || b instanceof Date) return new Date(a) - new Date(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
};

// rows: the list; sorters: { columnKey: (row) => value }; options.search: (row) => text
// that the search box looks in; options.key remembers the sort on this device.
export function useTableTools(rows, sorters = {}, { key, search, pageSize = 50, defaultSort = null, rowId = (r) => r.id } = {}) {
  const [sort, setSortState] = useState(defaultSort);
  // The remembered sort is read after the first paint, so the server and browser agree.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (key) setSortState(read(key, defaultSort));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(pageSize);
  const [selected, setSelected] = useState(() => new Set());

  const setSort = useCallback(
    (col) =>
      setSortState((prev) => {
        // Click once: ascending; twice: descending; third time: back to the original order.
        const next = prev?.col !== col ? { col, dir: "asc" } : prev.dir === "asc" ? { col, dir: "desc" } : null;
        write(key, next);
        return next;
      }),
    [key]
  );

  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q && search ? rows.filter((r) => String(search(r) || "").toLowerCase().includes(q)) : rows;
    const by = sort && sorters[sort.col];
    if (by) {
      list = [...list].sort((a, b) => compare(by(a), by(b)) * (sort.dir === "desc" ? -1 : 1));
    }
    return list;
    // sorters are plain lookups rebuilt each render; the sort only depends on its column.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, sort, search]);

  const shown = view.slice(0, limit);
  const ids = view.map(rowId);
  const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
  const someOn = ids.some((id) => selected.has(id));
  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allOn ? new Set() : new Set(ids));
  const clear = () => setSelected(new Set());
  const chosen = view.filter((r) => selected.has(rowId(r)));

  return { searchable: Boolean(search), sort, setSort, query, setQuery, view, shown, more: view.length - shown.length, showMore: () => setLimit((n) => n + pageSize), selected, toggle, toggleAll, allOn, someOn, clear, chosen };
}

// A sortable column header.
export function SortTh({ tools, col, children, className = "", align = "start" }) {
  const active = tools.sort?.col === col;
  const Icon = !active ? ArrowUpDown : tools.sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={`px-4 py-3 font-medium ${align === "end" ? "text-end" : align === "center" ? "text-center" : "text-start"} ${className}`} aria-sort={active ? (tools.sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => tools.setSort(col)} className={`group inline-flex items-center gap-1 uppercase tracking-wider hover:text-white ${active ? "text-white" : ""}`}>
        {children}
        <Icon size={12} className={active ? "text-brand-orange" : "opacity-40 group-hover:opacity-80"} />
      </button>
    </th>
  );
}

export function Checkbox({ checked, mixed = false, onChange, label }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={mixed ? "mixed" : checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={`flex h-5 w-5 items-center justify-center rounded-md border transition ${checked || mixed ? "border-brand-orange bg-brand-orange text-white" : "border-white/30 hover:border-white/60"}`}
    >
      {checked ? <Check size={13} strokeWidth={3} /> : mixed ? <Minus size={13} strokeWidth={3} /> : null}
    </button>
  );
}

// Search box + result count + CSV export, and, while rows are ticked, the bulk actions.
// actions: [{ label, icon: Icon, onClick: (rows) => Promise, danger }]
export function TableToolbar({ tools, placeholder, exportFile, exportColumns, actions = [], children }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(null);
  const count = tools.chosen.length;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {count > 0 ? (
        <div className="flex flex-1 flex-wrap items-center gap-2 rounded-xl border border-brand-orange/40 bg-brand-orange/10 px-3 py-2">
          <span className="text-sm font-semibold">{t("erp.ux.selected", { n: count })}</span>
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              disabled={Boolean(busy)}
              onClick={async () => {
                setBusy(a.label);
                try {
                  await a.onClick(tools.chosen);
                  tools.clear();
                } finally {
                  setBusy(null);
                }
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${a.danger ? "text-red-400 hover:bg-red-500/10" : "bg-white/10 hover:bg-white/15"}`}
            >
              {a.icon && <a.icon size={14} />}
              {busy === a.label ? t("common.loading") : a.label}
            </button>
          ))}
          {exportFile && (
            <button type="button" onClick={() => downloadCsv(exportFile, exportColumns, tools.chosen)} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/15">
              <Download size={14} /> {t("erp.ux.exportSelected")}
            </button>
          )}
          <button type="button" onClick={tools.clear} className="ms-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-white/70 hover:bg-white/10">
            <X size={14} /> {t("erp.ux.clearSelection")}
          </button>
        </div>
      ) : (
        <>
          {tools.searchable ? (
          <div className="relative min-w-56 flex-1">
            <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-white/50" />
            <input
              value={tools.query}
              onChange={(e) => tools.setQuery(e.target.value)}
              placeholder={placeholder || t("erp.search")}
              aria-label={placeholder || t("erp.search")}
              className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pe-9 ps-9 text-sm outline-none placeholder:text-white/45 focus:border-white/30"
            />
            {tools.query && (
              <button type="button" onClick={() => tools.setQuery("")} aria-label={t("erp.ux.clearSearch")} className="absolute end-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-white/50 hover:text-white">
                <X size={14} />
              </button>
            )}
          </div>
          ) : (
            <span className="flex-1" />
          )}
          {children}
          <span className="text-xs text-white/55 tabular-nums">{t("erp.ux.results", { n: tools.view.length })}</span>
          {exportFile && (
            <button type="button" onClick={() => downloadCsv(exportFile, exportColumns, tools.view)} className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium hover:bg-white/10">
              <Download size={14} /> {t("erp.ux.export")}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// "Show 50 more" under a long list.
export function ShowMore({ tools }) {
  const { t } = useLanguage();
  if (tools.more <= 0) return null;
  return (
    <div className="flex justify-center py-4">
      <button type="button" onClick={tools.showMore} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10">
        {t("erp.ux.showMore", { n: tools.more })}
      </button>
    </div>
  );
}

// A list with nothing in it: what belongs here, and the first step.
export function EmptyState({ icon: Icon = Inbox, title, text, action, compact = false }) {
  const { t } = useLanguage();
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? "gap-1.5 py-6" : "gap-3 py-14"}`}>
      <span className={`flex items-center justify-center rounded-2xl bg-white/5 text-white/50 ${compact ? "mb-1 h-10 w-10" : "h-12 w-12"}`}>
        <Icon size={compact ? 18 : 22} />
      </span>
      {/* Small lists only need the sentence; the title is for whole pages. */}
      {(title || !compact || !text) && <p className="font-semibold text-white/85">{title || t("erp.ux.emptyTitle")}</p>}
      {text && <p className={`max-w-sm text-sm ${title || !compact ? "text-white/55" : "text-white/65"}`}>{text}</p>}
      {action}
    </div>
  );
}

// columns: [{ label, value: (row) => text }]. Excel opens UTF-8 CSV correctly with the BOM.
export function downloadCsv(name, columns, rows) {
  if (!columns?.length) return;
  const cell = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => cell(c.label)).join(","), ...rows.map((r) => columns.map((c) => cell(c.value(r))).join(","))];
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
