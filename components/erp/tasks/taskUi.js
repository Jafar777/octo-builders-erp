"use client";

import { useEffect, useState } from "react";

// Colour per task / board-cell status.
export const STATUS_STYLE = {
  not_started: "bg-white/5 text-white/60 border-white/10",
  todo: "bg-slate-400/15 text-slate-200 border-slate-400/30",
  in_progress: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  on_hold: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  help: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  submitted: "bg-brand-orange/15 text-brand-orange border-brand-orange/40",
  pending: "bg-brand-orange/15 text-brand-orange border-brand-orange/40",
  approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  done: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  rejected: "bg-red-500/15 text-red-300 border-red-500/30",
  cancelled: "bg-white/5 text-white/55 border-white/10 line-through",
  skip: "bg-transparent text-white/60 border-dashed border-white/25",
};

export const PRIORITY_STYLE = {
  normal: "",
  important: "bg-amber-500/15 text-amber-300",
  urgent: "bg-red-500/15 text-red-300",
};

export const ACTIVE = ["todo", "in_progress", "on_hold", "help"];

export function formatDuration(ms) {
  const total = Math.max(0, Math.floor((ms || 0) / 60000));
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  return d ? `${d}d ${h}h ${String(m).padStart(2, "0")}m` : `${h}:${String(m).padStart(2, "0")}`;
}

export function liveActiveMs(task, now) {
  return (task.activeMs || 0) + (task.lastResumedAt ? now - new Date(task.lastResumedAt).getTime() : 0);
}

export function revisionLabel(n) {
  return `R-${String(n || 0).padStart(2, "0")}`;
}

// Current time that re-renders every `ms` while `enabled`.
export function useNow(enabled = true, ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [enabled, ms]);
  return now;
}

// "2026-10-03T14:30" for <input type="datetime-local"> from an ISO date.
export function toLocalInput(date) {
  if (!date) return "";
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toDateInput(date) {
  return toLocalInput(date).slice(0, 10);
}
