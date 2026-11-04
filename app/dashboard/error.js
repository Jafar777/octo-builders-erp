"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

// Something broke on a dashboard page: tell the System page, and let the person retry.
export default function DashboardError({ error, unstable_retry, reset }) {
  const { t } = useLanguage();
  useEffect(() => {
    fetch("/api/system/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: error?.message || String(error), stack: error?.stack || "", path: window.location.pathname }),
    }).catch(() => {});
  }, [error]);
  const retry = unstable_retry || reset;
  return (
    <div className="mx-auto mt-16 max-w-md space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
      <AlertTriangle className="mx-auto text-amber-300" size={32} />
      <p className="text-lg font-semibold">{t("erp.system.crashTitle")}</p>
      <p className="text-sm text-white/55">{t("erp.system.crashHint")}</p>
      {retry && (
        <button type="button" onClick={() => retry()} className="mx-auto flex items-center gap-2 rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-semibold text-white">
          <RotateCcw size={15} /> {t("erp.system.retry")}
        </button>
      )}
    </div>
  );
}
