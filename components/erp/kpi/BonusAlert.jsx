"use client";

import Link from "next/link";
import { CheckCircle2, Gift, Medal, Target, TrendingUp } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { money } from "@/components/erp/hr/hrUi";

// Place 1 / 2 / 3 colours; the place number is always written too.
const MEDAL = ["text-amber-300", "text-slate-200", "text-orange-300"];

// How much one person needs for each bonus place this month (`bonus` from
// lib/bonus.js bonusStanding). `isMe` switches the wording between "you" and "they".
export default function BonusAlert({ bonus, isMe = true, showLink = false }) {
  const { t, lang } = useLanguage();
  if (!bonus) return null;
  const m = (n) => money(n, bonus.currency, lang);
  const who = isMe ? "me" : "them";

  if (!bonus.pool) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-sm text-white/55">
        <Gift size={18} className="shrink-0 text-white/60" /> {t("erp.bonus.noPool")}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-400/[0.08] to-transparent p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold">
          <Gift size={18} className="text-amber-300" /> {t("erp.bonus.alertTitle", { amount: m(bonus.pool) })}
        </p>
        {showLink && (
          <Link href="/dashboard/bonus" className="text-xs text-amber-200 hover:underline">
            {t("erp.bonus.details")}
          </Link>
        )}
      </div>

      {!bonus.ranked ? (
        <p className="text-sm text-white/55">{t(`erp.bonus.notRanked_${who}`)}</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-white/70">
            {t(`erp.bonus.current_${who}`, { score: bonus.myScore, rank: bonus.myRank, of: bonus.of })}
            {bonus.minScore > 0 && <span className="text-white/60"> · {t("erp.bonus.minScoreNote", { min: bonus.minScore })}</span>}
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {bonus.places.map((p) => (
              <div
                key={p.place}
                className={`rounded-xl border p-3 ${p.mine && p.secured ? "border-emerald-400/50 bg-emerald-500/10" : "border-white/10 bg-white/[0.03]"}`}
              >
                <p className="flex items-center justify-between gap-2 text-sm">
                  <span className={`flex items-center gap-1.5 font-semibold ${MEDAL[p.place - 1] || "text-white/70"}`}>
                    <Medal size={15} /> {t("erp.bonus.place", { n: p.place })}
                  </span>
                  <span className="font-semibold tabular-nums">{m(p.amount)}</span>
                </p>
                <p className="mt-2 text-xs">
                  {p.mine && p.secured ? (
                    <span className="flex items-center gap-1 text-emerald-300">
                      <CheckCircle2 size={13} /> {t(`erp.bonus.holding_${who}`)}
                    </span>
                  ) : p.needed === 0 ? (
                    <span className="flex items-center gap-1 text-emerald-300">
                      <CheckCircle2 size={13} /> {t(`erp.bonus.ahead_${who}`)}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-200">
                      <Target size={13} /> {t(`erp.bonus.needed_${who}`, { n: p.needed })}
                    </span>
                  )}
                </p>
                {p.scoreToBeat !== null && !p.mine && (
                  <p className="mt-0.5 text-[11px] text-white/60">
                    {t("erp.bonus.scoreAtPlace", { score: p.scoreToBeat })}
                    {p.holderName ? ` · ${p.holderName}` : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
          {bonus.opportunities.length > 0 && !bonus.places[0]?.mine && (
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/55">
              <span className="flex items-center gap-1 text-white/70">
                <TrendingUp size={13} /> {t("erp.bonus.whereToGain")}
              </span>
              {bonus.opportunities.map((o) => (
                <span key={o.key}>
                  {o.name?.[lang]} <span className="text-emerald-300">+{o.gain}</span>
                </span>
              ))}
            </p>
          )}
          {bonus.closed && <p className="mt-3 text-xs text-white/60">{t("erp.bonus.closedNote", { amount: m(bonus.myBonus) })}</p>}
        </>
      )}
      {bonus.note && <p className="mt-3 whitespace-pre-line rounded-xl bg-white/5 px-3 py-2 text-sm text-white/75">{bonus.note}</p>}
    </div>
  );
}
