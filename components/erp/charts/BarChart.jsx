"use client";

import { useState } from "react";

// Validated categorical slots for the dark dashboard surface (dataviz reference
// palette, dark steps; first three pass all checks on #132a3b).
export const SERIES_COLORS = ["#3987e5", "#d95926", "#199e70"];

function niceMax(v) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/**
 * Grouped vertical bars.
 * categories: [{ key, label }]
 * series:     [{ key, label, values: { [categoryKey]: number|null } }]  (≤ 3)
 */
export function GroupedBarChart({ categories, series, height = 220, unit = "", max: fixedMax }) {
  const [hover, setHover] = useState(null); // { cat, x }
  const values = series.flatMap((s) => categories.map((c) => s.values[c.key] ?? 0));
  const max = fixedMax || niceMax(Math.max(0, ...values));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f * 10) / 10);
  const barW = Math.max(6, Math.min(22, 120 / series.length));

  return (
    <div className="w-full">
      {series.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-4 text-xs text-white/70">
          {series.map((s, i) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES_COLORS[i] }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div className="relative flex" style={{ height }} dir="ltr">
        {/* y axis */}
        <div className="relative w-9 shrink-0 text-[10px] text-white/40">
          {ticks.map((tk) => (
            <span key={tk} className="absolute end-1.5 tabular-nums" style={{ bottom: `${(tk / max) * 100}%`, transform: "translateY(50%)" }}>
              {tk}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          {ticks.map((tk) => (
            <div key={tk} className="absolute inset-x-0 border-t border-white/[0.07]" style={{ bottom: `${(tk / max) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end justify-around">
            {categories.map((c) => (
              <div
                key={c.key}
                className="relative flex h-full flex-1 items-end justify-center gap-[2px]"
                onMouseEnter={() => setHover(c.key)}
                onMouseLeave={() => setHover(null)}
              >
                {hover === c.key && <div className="absolute inset-0 rounded-md bg-white/[0.04]" />}
                {series.map((s, i) => {
                  const v = s.values[c.key];
                  return (
                    <div
                      key={s.key}
                      className="relative rounded-t-[4px] transition-[height] duration-500"
                      style={{ width: barW, height: `${((v || 0) / max) * 100}%`, background: SERIES_COLORS[i], minHeight: v ? 2 : 0 }}
                    />
                  );
                })}
                {hover === c.key && (
                  <div className="pointer-events-none absolute bottom-full z-10 mb-1 min-w-32 rounded-lg border border-white/10 bg-brand-navy px-3 py-2 text-xs shadow-xl">
                    <p className="mb-1 font-medium text-white">{c.label}</p>
                    {series.map((s, i) => (
                      <p key={s.key} className="flex items-center justify-between gap-3 text-white/70">
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-sm" style={{ background: SERIES_COLORS[i] }} />
                          {s.label}
                        </span>
                        <span className="tabular-nums text-white">
                          {s.values[c.key] ?? "—"}
                          {s.values[c.key] !== null && s.values[c.key] !== undefined ? unit : ""}
                        </span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="ms-9 mt-2 flex justify-around text-center text-[11px] text-white/55" dir="ltr">
        {categories.map((c) => (
          <span key={c.key} className="flex-1 truncate px-1" title={c.label}>
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// Single series, horizontal bars with direct value labels (rankings, distributions).
export function HorizontalBars({ items, unit = "", color = SERIES_COLORS[0] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-2.5">
      {items.map((i) => (
        <div key={i.key} className="group" title={`${i.label}: ${i.value}${unit}`}>
          <div className="mb-1 flex justify-between gap-3 text-xs">
            <span className="truncate text-white/75">{i.label}</span>
            <span className="tabular-nums text-white">
              {i.value}
              {unit}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full transition-all duration-500 group-hover:brightness-125" style={{ width: `${(i.value / max) * 100}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Score gauge (0–100) with target marker — a stat, not a chart.
export function ScoreRing({ score, target = 80, size = 120 }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score || 0)) / 100;
  const t = (target / 100) * 2 * Math.PI - Math.PI / 2;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`${score} / 100`}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke={SERIES_COLORS[0]}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform="rotate(-90 60 60)"
        style={{ transition: "stroke-dasharray 0.8s ease" }}
      />
      <line x1={60 + 38 * Math.cos(t)} y1={60 + 38 * Math.sin(t)} x2={60 + 55 * Math.cos(t)} y2={60 + 55 * Math.sin(t)} stroke="#ffffff" strokeWidth="2" opacity="0.6" />
      <text x="60" y="58" textAnchor="middle" fill="#ffffff" fontSize="26" fontWeight="700">
        {score ?? "—"}
      </text>
      <text x="60" y="76" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="11">
        / 100
      </text>
    </svg>
  );
}
