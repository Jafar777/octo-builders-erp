"use client";

import { useCallback, useEffect, useState } from "react";
import { Star, EyeOff } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import Avatar from "@/components/erp/ui/Avatar";
import { Card } from "@/components/erp/ui/fields";
import { useToast } from "@/components/erp/ui/Feedback";

function Stars({ value, onPick, disabled }) {
  return (
    <div className="flex gap-0.5" dir="ltr">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={disabled} onClick={() => onPick(n)} aria-label={String(n)} className="p-0.5 disabled:cursor-default">
          <Star size={20} className={n <= (value || 0) ? "fill-amber-400 text-amber-400" : "text-white/25"} />
        </button>
      ))}
    </div>
  );
}

const avgText = (r, t) => (r.average === null ? t("erp.teamRating.notEnough", { n: r.count }) : `${r.average} / 5 · ${t("erp.teamRating.raters", { n: r.count })}`);

// Anonymous monthly rating of one's department head (models/TeamRating.js). Heads see
// their team's average; the CEO / GM see every head's.
export default function TeamRatings() {
  const { t } = useLanguage();
  const toast = useToast();
  const [data, setData] = useState(null);
  const load = useCallback(() => api("/api/team-ratings", { quiet: true }).then(setData).catch(() => setData(false)), []);
  useEffect(() => {
    load();
  }, [load]);
  if (!data || (!data.toRate.length && !data.myTeam && !data.allHeads)) return null;

  const rate = async (headId, score) => {
    try {
      await api("/api/team-ratings", { method: "POST", body: { headId, score }, quiet: true });
      toast({ text: t("erp.teamRating.thanks") });
      load();
    } catch (err) {
      toast({ text: errorText(t, err), tone: "error" });
    }
  };

  return (
    <Card className="mb-5 space-y-4">
      <div>
        <p className="font-semibold">{t("erp.teamRating.title")}</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-white/60">
          <EyeOff size={13} /> {t("erp.teamRating.anonymous", { n: data.minRaters })}
        </p>
      </div>
      {data.toRate.map((h) => (
        <div key={h.id} className="flex flex-wrap items-center gap-3">
          <Avatar name={h.name} src={h.avatarUrl} size={32} />
          <span className="flex-1 text-sm">{h.name}</span>
          <Stars value={h.myScore} onPick={(n) => rate(h.id, n)} />
        </div>
      ))}
      {data.myTeam && (
        <div className="border-t border-white/10 pt-3 text-sm">
          <p className="mb-1 text-white/70">{t("erp.teamRating.yourTeam")}</p>
          {data.myTeam.length ? (
            data.myTeam
              .sort((a, b) => b.month.localeCompare(a.month))
              .slice(0, 3)
              .map((r) => (
                <p key={r.month} className="text-white/85">
                  <span dir="ltr">{r.month}</span>: {avgText(r, t)}
                </p>
              ))
          ) : (
            <p className="text-white/50">{t("erp.teamRating.none")}</p>
          )}
        </div>
      )}
      {data.allHeads && (
        <div className="border-t border-white/10 pt-3">
          <p className="mb-2 text-sm text-white/70">{t("erp.teamRating.allHeads")}</p>
          <div className="space-y-2">
            {data.allHeads.map((h) => (
              <div key={h.id} className="flex flex-wrap items-center gap-3 text-sm">
                <Avatar name={h.name} src={h.avatarUrl} size={28} />
                <span className="w-40 truncate">{h.name}</span>
                <span className="text-white/70">{h.months[0] ? <><span dir="ltr">{h.months[0].month}</span>: {avgText(h.months[0], t)}</> : t("erp.teamRating.none")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
