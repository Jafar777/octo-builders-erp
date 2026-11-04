"use client";

import { Check, Minus } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { visibleNavKeys } from "@/components/dashboard/DashboardShell";
import { ALWAYS_PAGES, effectiveAccess, PAGES, PERMISSIONS, SENSITIVE_PERMISSIONS } from "@/lib/permissions";

// Shared pieces of the Roles page (components/erp/roles/*).

export const PERM_GROUPS = [...new Set(PERMISSIONS.map((p) => p.group))];
export const hintKey = (perm) => `erp.access.hint.${perm.replace(/\./g, "_")}`;
export const isSensitive = (perm) => SENSITIVE_PERMISSIONS.includes(perm);
export const sameSet = (a = [], b = []) => a.length === b.length && a.every((x) => b.includes(x));

// A pretend signed-in user holding `role` (with `overrides`), for the sidebar preview.
export function simulatedUser(role, overrides, extra = {}) {
  const a = effectiveAccess(role, overrides, role?.key);
  return { isStaff: true, isCustomer: false, trainee: false, role: role?.key, ...extra, ...a, limited: a.limited };
}

// What a role or person sees in the sidebar, grouped like the real one.
export function NavPreview({ user, hint }) {
  const { t } = useLanguage();
  const keys = visibleNavKeys(user);
  const groups = ["main", "management"].map((g) => ({ g, items: PAGES.filter((p) => p.group === g && keys.includes(p.key)) }));
  return (
    <div>
      {hint && <p className="mb-3 text-xs text-white/40">{hint}</p>}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
        {keys.length === 0 && <p className="text-xs text-white/35">{t("erp.access.previewNone")}</p>}
        {groups.map(
          ({ g, items }) =>
            items.length > 0 && (
              <div key={g} className="mb-2 last:mb-0">
                {g !== "main" && <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-white/30">{t(`erp.nav.group_${g}`)}</p>}
                <ul className="space-y-0.5">
                  {items.map((p) => (
                    <li key={p.key} className="rounded-lg px-2 py-1.5 text-xs text-white/75 odd:bg-white/[0.03]">
                      {t(`erp.nav.${p.key}`)}
                    </li>
                  ))}
                </ul>
              </div>
            )
        )}
      </div>
    </div>
  );
}

export function Section({ title, aside, children }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white/85">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Chip({ children, tone = "plain", title }) {
  const tones = {
    plain: "bg-white/10 text-white/65",
    orange: "bg-brand-orange/15 text-brand-orange",
    red: "bg-red-500/15 text-red-300",
    green: "bg-emerald-500/15 text-emerald-300",
    sky: "bg-sky-500/15 text-sky-300",
  };
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

// A three-state box: all, some or none of a group ticked.
export function GroupBox({ state, onClick, disabled, label }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
        state === "none" ? "border-white/25" : "border-brand-orange bg-brand-orange text-white"
      } disabled:opacity-40`}
    >
      {state === "all" && <Check size={11} strokeWidth={3} />}
      {state === "some" && <Minus size={11} strokeWidth={3} />}
    </button>
  );
}

// The pages a role's page list can hold: everything, or only the restricted ones.
export function PagePicker({ pages, onChange, restrictedTo, disabled }) {
  const { t } = useLanguage();
  const all = !pages.length && !restrictedTo;
  const choices = PAGES.filter((p) => !restrictedTo || restrictedTo.includes(p.key));
  const checked = (k) => ALWAYS_PAGES.includes(k) || (restrictedTo ? (pages.length ? pages : restrictedTo).includes(k) : all || pages.includes(k));
  function toggle(k) {
    const base = restrictedTo ? (pages.length ? pages : restrictedTo) : all ? PAGES.map((p) => p.key) : pages;
    const next = base.includes(k) ? base.filter((x) => x !== k) : [...base, k];
    // Everything ticked again = no list.
    onChange(!restrictedTo && PAGES.every((p) => next.includes(p.key) || ALWAYS_PAGES.includes(p.key)) ? [] : next);
  }
  return (
    <div className="space-y-3">
      {!restrictedTo && (
        <div className="flex flex-wrap gap-2">
          {[
            ["all", t("erp.access.pagesAll")],
            ["some", t("erp.access.pagesSome")],
          ].map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              disabled={disabled}
              onClick={() => onChange(mode === "all" ? [] : PAGES.map((p) => p.key))}
              className={`rounded-full border px-3 py-1.5 text-xs ${
                (mode === "all") === all ? "border-brand-orange bg-brand-orange/15 text-white" : "border-white/10 text-white/55 hover:text-white"
              } disabled:opacity-50`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {choices.map((p) => {
          const always = ALWAYS_PAGES.includes(p.key);
          return (
            <label
              key={p.key}
              className={`flex items-center gap-2 rounded-lg border border-white/5 px-2.5 py-2 text-xs ${always || disabled ? "text-white/45" : "cursor-pointer text-white/80 hover:bg-white/5"}`}
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-[#f37b20]"
                disabled={always || disabled}
                checked={checked(p.key)}
                onChange={() => toggle(p.key)}
              />
              <span className="flex-1">{t(`erp.nav.${p.key}`)}</span>
              {always && <span className="text-[10px] text-white/30">{t("erp.access.always")}</span>}
            </label>
          );
        })}
      </div>
      <p className="text-xs text-white/35">{t(restrictedTo ? "erp.access.pagesRestrictedHint" : "erp.access.pagesHint")}</p>
    </div>
  );
}
