"use client";

export default function Avatar({ name, src, size = 40, online }) {
  // The first whole character (an emoji is two code units; letters come first if any).
  const text = (name || "?").trim();
  const initial = (text.match(/\p{L}/u)?.[0] || Array.from(text)[0] || "?").toUpperCase();
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-white/10 text-sm font-semibold text-white">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </span>
      {online !== undefined && (
        <span
          className={`absolute bottom-0 end-0 h-3 w-3 rounded-full border-2 border-brand-navy ${
            online ? "bg-emerald-400" : "bg-white/25"
          }`}
        />
      )}
    </span>
  );
}
