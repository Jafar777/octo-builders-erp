"use client";

import { useEffect, useState } from "react";

// A thin glowing bar at the top of the dashboard whenever data is loading or
// saving. It watches every request to our own /api (fetch is wrapped once), so
// screens don't have to report anything. Background traffic (typing, read
// receipts, realtime auth, unread counters) doesn't trigger it.
const QUIET = [/\/api\/realtime\//, /\/typing$/, /\/read$/, /\/api\/messages\/unread/, /\/api\/notifications(\?|$)/];

let active = 0;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(active));

function install() {
  if (typeof window === "undefined" || window.__octoFetchWrapped) return;
  window.__octoFetchWrapped = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    const tracked = (url.startsWith("/api/") || url.startsWith(`${window.location.origin}/api/`)) && !QUIET.some((r) => r.test(url.split("?")[0]) || r.test(url));
    if (!tracked) return original(input, init);
    active += 1;
    emit();
    try {
      return await original(input, init);
    } finally {
      active -= 1;
      emit();
    }
  };
}

export default function TopProgress() {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    install();
    let showTimer;
    let hideTimer;
    const onChange = (count) => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      // Quick requests (< 150 ms) don't flash the bar; it lingers briefly when done.
      if (count > 0) showTimer = setTimeout(() => setBusy(true), 150);
      else hideTimer = setTimeout(() => setBusy(false), 250);
    };
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden transition-opacity duration-300 ${busy ? "opacity-100" : "opacity-0"}`}
    >
      <div className="absolute inset-0 bg-brand-orange/15" />
      <div className="progress-runner absolute inset-y-0 w-2/5 rounded-full bg-gradient-to-r from-transparent via-brand-orange to-brand-peach shadow-[0_0_12px_2px_rgba(243,123,32,0.6)]" />
    </div>
  );
}
