"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Building2, CalendarClock, Clock, Flag, User } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, peekApi } from "@/lib/clientApi";
import { formatDate, formatDateTime, formatRelative } from "@/lib/formatTime";
import { isOverdue } from "@/lib/office";

// Pieces every office screen shares: the pickers' lists, status / priority chips, the
// date chips, and one row for a tracked item (follow-up, request, complaint…).

const LOOKUP_URL = "/api/office/lookup";

// People, departments, clients, projects and open inquiries for the pickers (one call,
// kept for the session). `reload()` after adding a client.
export function useLookup(enabled = true) {
  const [data, setData] = useState(() => peekApi(LOOKUP_URL) || null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    api(LOOKUP_URL)
      .then(setData)
      .catch(() => setData((d) => d || { people: [], departments: [], clients: [], projects: [], leads: [] }));
  }, [enabled, n]);
  return { lookup: data || { people: [], departments: [], clients: [], projects: [], leads: [] }, reload: () => setN((x) => x + 1) };
}

export const inputCls =
  "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/30 [&>option]:bg-brand-navy";

// A plain select over a list of { id, name }.
export function PickSelect({ value, onChange, list, placeholder, className = "", ariaLabel }) {
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel || placeholder} className={`${inputCls} ${className}`}>
      <option value="">{placeholder}</option>
      {list.map((x) => (
        <option key={x.id} value={x.id}>
          {x.code ? `${x.code} · ${x.name}` : x.name}
        </option>
      ))}
    </select>
  );
}

// "Who acts": a person or a department, in one select ("p:<id>" / "d:<id>").
export function TargetSelect({ person, department, onChange, lookup, placeholder, className = "" }) {
  const { t } = useLanguage();
  const value = person ? `p:${person}` : department ? `d:${department}` : "";
  return (
    <select
      value={value}
      aria-label={placeholder}
      onChange={(e) => {
        const [k, id] = e.target.value.split(":");
        onChange({ person: k === "p" ? id : "", department: k === "d" ? id : "" });
      }}
      className={`${inputCls} ${className}`}
    >
      <option value="">{placeholder}</option>
      <optgroup label={t("erp.office.departments")}>
        {lookup.departments.map((d) => (
          <option key={d.id} value={`d:${d.id}`}>
            {d.name}
          </option>
        ))}
      </optgroup>
      <optgroup label={t("erp.office.people")}>
        {lookup.people.map((p) => (
          <option key={p.id} value={`p:${p.id}`}>
            {p.name}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

// Today / Tomorrow / Next week / a date. `value`: a chip key or YYYY-MM-DD.
export function DueChips({ value, onChange, allowNone = true }) {
  const { t } = useLanguage();
  const chips = [...(allowNone ? [""] : []), "today", "tomorrow", "week"];
  const custom = /^\d{4}-\d{2}-\d{2}$/.test(value || "");
  return (
    <div className="flex flex-wrap items-center gap-1">
      {chips.map((c) => (
        <button
          key={c || "none"}
          type="button"
          onClick={() => onChange(c)}
          className={`rounded-lg px-2.5 py-1 text-xs ${(value || "") === c ? "bg-brand-orange text-white" : "bg-white/5 text-white/60 hover:text-white"}`}
        >
          {t(`erp.office.due.${c || "none"}`)}
        </button>
      ))}
      <input
        type="date"
        value={custom ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t("erp.office.due.pick")}
        className={`rounded-lg border px-2 py-0.5 text-xs text-white outline-none [color-scheme:dark] ${custom ? "border-brand-orange bg-brand-orange/20" : "border-white/10 bg-white/5"}`}
      />
    </div>
  );
}

const STATUS_STYLE = {
  open: "border-sky-400/40 bg-sky-500/10 text-sky-200",
  sent: "border-amber-400/40 bg-amber-500/10 text-amber-200",
  acknowledged: "border-violet-400/40 bg-violet-500/10 text-violet-200",
  waiting: "border-white/20 bg-white/5 text-white/70",
  done: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
  cancelled: "border-white/10 bg-white/5 text-white/40",
};

export function StatusPill({ status }) {
  const { t } = useLanguage();
  return <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] ${STATUS_STYLE[status] || STATUS_STYLE.waiting}`}>{t(`erp.office.status.${status}`)}</span>;
}

export function KindPill({ kind }) {
  const { t } = useLanguage();
  return <span className="whitespace-nowrap rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] text-white/60">{t(`erp.office.kind.${kind}`)}</span>;
}

export function PriorityFlag({ priority }) {
  const { t } = useLanguage();
  if (!priority || priority === "normal") return null;
  return (
    <span title={t(`erp.office.priority.${priority}`)} className={priority === "urgent" ? "text-red-400" : "text-amber-400"}>
      <Flag size={13} />
    </span>
  );
}

// "Waiting 26 h" — how long a department has had it without answering.
export function WaitingAge({ hours }) {
  const { t } = useLanguage();
  if (hours == null) return null;
  const label = hours >= 48 ? t("erp.office.waitingDays", { n: Math.floor(hours / 24) }) : t("erp.office.waitingHours", { n: Math.max(1, Math.round(hours)) });
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${hours >= 24 ? "text-red-300" : "text-amber-200"}`}>
      <Clock size={11} />
      {label}
    </span>
  );
}

export function DueLabel({ item }) {
  const { lang, t } = useLanguage();
  if (!item.due) return null;
  const late = isOverdue(item);
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${late ? "text-red-300" : "text-white/50"}`}>
      {late ? <AlertTriangle size={11} /> : <CalendarClock size={11} />}
      {late ? t("erp.office.lateSince", { date: formatDate(item.due, lang) }) : formatDate(item.due, lang)}
    </span>
  );
}

// Who has it: the person, or the department.
export function TargetLabel({ item }) {
  if (item.assignee)
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-white/60">
        <User size={11} />
        {item.assignee.name}
      </span>
    );
  if (item.department)
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-white/60">
        <Building2 size={11} style={{ color: item.department.color || undefined }} />
        {item.department.name}
      </span>
    );
  return null;
}

// One tracked item as a row; `actions` on the end, the whole row opens it.
export function ItemRow({ item, onOpen, actions = null, showTarget = true }) {
  const { lang } = useLanguage();
  return (
    <div
      data-entity={`office:${item.id}`}
      className="group flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 hover:border-white/20 hover:bg-white/[0.04]"
    >
      <button type="button" onClick={() => onOpen?.(item)} className="min-w-0 flex-1 text-start">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[11px] text-white/40">{item.code}</span>
          <KindPill kind={item.kind} />
          <PriorityFlag priority={item.priority} />
          <span className="min-w-0 truncate text-sm font-medium text-white">{item.title}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusPill status={item.status} />
          {showTarget && <TargetLabel item={item} />}
          {item.requester && item.kind === "admin_request" && (
            <span className="inline-flex items-center gap-1 text-[11px] text-white/60">
              <User size={11} />
              {item.requester.name}
            </span>
          )}
          {item.client && <span className="text-[11px] text-sky-200/80">{item.client.name}</span>}
          {item.project && <span className="text-[11px] text-white/50">{item.project.code || item.project.name}</span>}
          <DueLabel item={item} />
          <WaitingAge hours={item.waitingHours} />
          {item.closedAt && <span className="text-[11px] text-white/40">{formatDateTime(item.closedAt, lang)}</span>}
          {!item.closedAt && !item.due && <span className="text-[11px] text-white/35">{formatRelative(item.createdAt, lang)}</span>}
        </div>
      </button>
      {actions && <div className="flex shrink-0 items-center gap-1 opacity-80 group-hover:opacity-100">{actions}</div>}
    </div>
  );
}

// A small icon button for row actions.
export function RowButton({ icon: Icon, label, onClick, tone = "" }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white ${tone}`}
    >
      <Icon size={15} />
    </button>
  );
}

// A titled box with a count, for the Today board.
export function Section({ title, count, icon: Icon, tone = "text-white/70", children, empty, action = null }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center gap-2">
        {Icon && <Icon size={16} className={tone} />}
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {count != null && <span className={`rounded-full px-2 text-xs ${count ? "bg-white/10 text-white" : "text-white/40"}`}>{count}</span>}
        <div className="ms-auto">{action}</div>
      </div>
      {count === 0 && empty ? <p className="text-xs text-white/40">{empty}</p> : <div className="space-y-2">{children}</div>}
    </section>
  );
}
