"use client";

import { useRouter } from "next/navigation";
import { BellRing, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { formatRelative } from "@/lib/formatTime";
import { entityKey, focusEntities, isOnPage } from "@/components/dashboard/focusEntity";

// On top of a page: the notifications its sidebar badge was counting, so it's clear
// what's new here. Each points at the exact thing it's about: scrolls to it and makes it
// glow (components/dashboard/focusEntity.js), opening its page first when needed.
// They're marked as seen when the page opens; this list stays until the person leaves
// the page or closes it.
export default function PageNotifications({ list, onClose }) {
  const { t, lang } = useLanguage();
  const router = useRouter();
  if (!list?.length) return null;
  const Arrow = lang === "ar" ? ChevronLeft : ChevronRight;
  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-brand-orange/40 bg-brand-orange/[0.07]">
      <div className="flex items-center gap-2 border-b border-brand-orange/20 px-4 py-2.5">
        <BellRing size={16} className="text-brand-orange" />
        <p className="flex-1 text-sm font-semibold">{t("notifications.onThisPage", { n: list.length })}</p>
        <button type="button" onClick={onClose} aria-label={t("notifications.close")} className="rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white">
          <X size={15} />
        </button>
      </div>
      <ul className="max-h-72 divide-y divide-white/5 overflow-y-auto">
        {list.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => {
                // On this page: point at it. Elsewhere: open its page, then point at it.
                const key = entityKey(n);
                if (!isOnPage(key) && n.link) router.push(n.link);
                focusEntities([key]);
              }}
              className="flex w-full items-start gap-3 px-4 py-3 text-start text-sm hover:bg-white/5"
            >
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-orange" />
              <span className="min-w-0 flex-1">
                <span className="block break-words text-white/90">{n.message?.[lang] || n.message?.en || ""}</span>
                <span className="mt-0.5 block text-xs text-white/50">{formatRelative(n.createdAt, lang)}</span>
              </span>
              {n.link && (
                <span className="flex shrink-0 items-center gap-0.5 self-center text-xs text-brand-orange">
                  {t("notifications.open")} <Arrow size={14} />
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
