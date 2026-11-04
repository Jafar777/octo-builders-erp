"use client";

import { Star } from "lucide-react";

// Five stars. Read-only by default (rounded to the nearest star); pass `onChange`
// to make it a picker — clicking the current value again clears it.
export default function Stars({ value = 0, onChange, size = 16, className = "" }) {
  const filled = Math.round(value);
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} dir="ltr" role="img" aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const star = (
          <Star size={size} className={n <= filled ? "fill-amber-400 text-amber-400" : "text-white/60"} />
        );
        return onChange ? (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n === value ? 0 : n)}
            className="rounded p-0.5 transition-transform hover:scale-110"
            aria-label={`${n} / 5`}
          >
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </span>
  );
}
