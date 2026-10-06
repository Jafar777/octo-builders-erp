"use client";

// KPI score (0–100) as a ring. `score` null → empty grey ring with "—".
export function kpiTone(score) {
  if (score === null || score === undefined) return "text-white/25";
  if (score >= 85) return "text-emerald-400";
  if (score >= 70) return "text-sky-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

export default function KpiRing({ score, size = 40, stroke = 4, label }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const value = score === null || score === undefined ? 0 : Math.max(0, Math.min(100, score));
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center ${kpiTone(score)}`} style={{ width: size, height: size }} title={label}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <span className="absolute font-semibold tabular-nums text-white" style={{ fontSize: Math.max(10, size * 0.28) }}>
        {score === null || score === undefined ? "—" : Math.round(score)}
      </span>
    </span>
  );
}
