"use client";

export default function TextField({ label, value, onChange, type = "text", dir = "ltr", placeholder }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-white/70">{label}</label>
      <input
        type={type}
        dir={dir}
        value={value || ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/45 focus:border-white/30"
      />
    </div>
  );
}
