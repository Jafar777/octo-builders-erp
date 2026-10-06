"use client";

import { Loader2 } from "lucide-react";

// Small form controls shared by the ERP screens (same look as the website editors).

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/30";

export function Label({ children }) {
  return <label className="mb-2 block text-sm font-medium text-white/70">{children}</label>;
}

export function Select({ label, value, onChange, options, placeholder, disabled }) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`${inputClass} [&>option]:bg-brand-navy disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Input({ label, value, onChange, type = "text", dir, placeholder, ...rest }) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <input
        type={type}
        dir={dir}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
        {...rest}
      />
    </div>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3 text-sm text-white/80"
    >
      <span className={`relative h-6 w-11 rounded-full transition-colors ${checked ? "bg-brand-orange" : "bg-white/15"}`}>
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
            checked ? "start-[22px]" : "start-0.5"
          }`}
        />
      </span>
      {label}
    </button>
  );
}

// `loading` shows a spinner and blocks double clicks while an action runs.
export function Button({ children, variant = "primary", className = "", loading = false, disabled, ...rest }) {
  const styles = {
    primary: "bg-brand-orange text-white hover:scale-[1.01]",
    ghost: "border border-white/15 bg-white/5 text-white hover:bg-white/10",
    danger: "border border-red-500/30 text-red-400 hover:bg-red-500/10",
  };
  return (
    <button
      type="button"
      className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${styles[variant]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

export function ErrorText({ children }) {
  if (!children) return null;
  return <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{children}</p>;
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-white/50">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = "" }) {
  return <div className={`rounded-2xl border border-white/10 bg-white/[0.03] p-5 ${className}`}>{children}</div>;
}
