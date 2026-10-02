"use client";

import { useCallback, useEffect, useState } from "react";
import { Fingerprint, LogIn, LogOut } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatClock } from "@/lib/formatTime";
import { Button, ErrorText } from "@/components/erp/ui/fields";
import { Skeleton } from "@/components/erp/ui/Loading";

// Today's punches and — when HR enabled it — a check-in / check-out button
// (backup for the fingerprint device). Hidden when there's nothing to show.
export default function CheckInCard() {
  const { t, lang } = useLanguage();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => api("/api/attendance/checkin").then(setData).catch(() => setData({ enabled: false, punches: [] })), []);
  useEffect(() => {
    load();
  }, [load]);

  async function punch() {
    setBusy(true);
    setError("");
    try {
      await api("/api/attendance/checkin", { method: "POST" });
      await load();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <Skeleton className="h-24 w-full rounded-2xl" />;
  // Nothing to show or do: no button and no punches (e.g. owners without a fingerprint ID).
  if ((!data.enabled || !data.hasBadge) && data.punches.length === 0) return null;
  const first = data.punches[0];
  const last = data.punches.length > 1 ? data.punches.at(-1) : null;
  const checkedIn = data.punches.length > 0;

  return (
    <div className="animate-fade-up flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-gradient-to-br from-brand-orange/[0.08] to-transparent p-4">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-orange/15 text-brand-orange">
        <Fingerprint size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{t("erp.checkin.today")}</p>
        <p className="text-sm text-white/55">
          {first ? (
            <>
              {t("erp.checkin.in")} <span dir="ltr">{formatClock(first.time, lang)}</span>
              {last && (
                <>
                  {" · "}
                  {t("erp.checkin.out")} <span dir="ltr">{formatClock(last.time, lang)}</span>
                </>
              )}
            </>
          ) : (
            t("erp.checkin.none")
          )}
        </p>
      </div>
      {data.enabled && data.hasBadge && (
        <Button onClick={punch} loading={busy} variant={checkedIn ? "ghost" : "primary"}>
          {checkedIn ? <LogOut size={16} className="rtl:rotate-180" /> : <LogIn size={16} className="rtl:rotate-180" />}
          {checkedIn ? t("erp.checkin.checkOut") : t("erp.checkin.checkIn")}
        </Button>
      )}
      <div className="w-full empty:hidden">
        <ErrorText>{error}</ErrorText>
      </div>
    </div>
  );
}
