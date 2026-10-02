"use client";

import Image from "next/image";
import { useLanguage } from "@/context/LanguageContext";

// Loading placeholders shared by every dashboard screen. Skeletons keep the shape
// of what's coming so the page doesn't jump when the data arrives.

export function Skeleton({ className = "", ...rest }) {
  return <div aria-hidden className={`skeleton rounded-lg ${className}`} {...rest} />;
}

export function SkeletonText({ lines = 3, className = "" }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

// Rows like task / message / staff lists: avatar or tag + two lines + a badge.
export function SkeletonList({ rows = 5, avatar = true, className = "" }) {
  return (
    <div className={`space-y-2 ${className}`} role="status" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl border border-white/[0.06] px-4 py-3" style={{ opacity: 1 - i * 0.12 }}>
          {avatar && <Skeleton className="h-9 w-9 shrink-0 rounded-full" />}
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2.5 w-3/5" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// Stat tiles.
export function SkeletonCards({ count = 4, className = "" }) {
  return (
    <div className={`grid grid-cols-2 gap-3 md:grid-cols-4 ${className}`} role="status" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-2xl border border-white/[0.06] p-4">
          <Skeleton className="h-2.5 w-1/2" />
          <Skeleton className="mt-3 h-7 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 6, cols = 5, className = "" }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-white/[0.06] ${className}`} role="status" aria-busy="true">
      <div className="flex gap-4 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
        {Array.from({ length: cols }, (_, i) => (
          <Skeleton key={i} className="h-2.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4 border-b border-white/[0.04] px-4 py-3.5 last:border-0" style={{ opacity: 1 - r * 0.1 }}>
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className={`h-3 flex-1 ${c === 0 ? "max-w-48" : ""}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart({ className = "" }) {
  const bars = [45, 70, 35, 85, 55, 65, 40, 75, 50, 60, 30, 80];
  return (
    <div className={`rounded-2xl border border-white/[0.06] p-5 ${className}`} role="status" aria-busy="true">
      <Skeleton className="mb-5 h-3 w-1/3" />
      <div className="flex h-44 items-end gap-2">
        {bars.map((h, i) => (
          <Skeleton key={i} className="flex-1 rounded-t-md rounded-b-none" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

// Whole page while a route loads: title, tabs, tiles and a table.
export function PageSkeleton({ tiles = 4, tabs = 0 }) {
  return (
    <div className="animate-fade-up" role="status" aria-busy="true">
      <div className="mb-8 space-y-3">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-3 w-80 max-w-full" />
      </div>
      {tabs > 0 && (
        <div className="mb-6 flex gap-3 border-b border-white/[0.06] pb-3">
          {Array.from({ length: tabs }, (_, i) => (
            <Skeleton key={i} className="h-4 w-24" />
          ))}
        </div>
      )}
      {tiles > 0 && <SkeletonCards count={tiles} className="mb-6" />}
      <SkeletonTable />
    </div>
  );
}

// Centered brand loader for full-screen moments (first load, big actions).
export function BrandLoader({ label, className = "" }) {
  const { t } = useLanguage();
  return (
    <div className={`flex flex-col items-center justify-center gap-4 py-16 ${className}`} role="status" aria-live="polite">
      <div className="relative h-16 w-16">
        <div className="loader-breathe absolute inset-0 rounded-full bg-brand-orange/20 blur-xl" />
        <svg viewBox="0 0 64 64" className="loader-arc absolute inset-0 h-full w-full">
          <circle cx="32" cy="32" r="29" fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="3" />
          <circle cx="32" cy="32" r="29" fill="none" stroke="url(#loader-grad)" strokeWidth="3" strokeLinecap="round" strokeDasharray="60 122" />
          <defs>
            <linearGradient id="loader-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f37b20" />
              <stop offset="100%" stopColor="#ef9957" stopOpacity="0.2" />
            </linearGradient>
          </defs>
        </svg>
        <Image src="/brand/00-Icon.png" alt="" width={32} height={32} className="loader-breathe absolute inset-0 m-auto h-8 w-8" />
      </div>
      <p className="text-sm text-white/50">{label || t("erp.loading")}</p>
    </div>
  );
}

// Shows `fallback` (default: a list skeleton) until `loading` is false, then fades the content in.
export function Loadable({ loading, fallback, children }) {
  if (loading) return fallback || <SkeletonList />;
  return <div className="animate-fade-up">{children}</div>;
}
