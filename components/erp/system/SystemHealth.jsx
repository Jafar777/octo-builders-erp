"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Globe, Server } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api } from "@/lib/clientApi";
import { Card, PageHeader } from "@/components/erp/ui/fields";
import { LoginHistory } from "@/components/erp/security/SecurityCard";

const fmt = (d, lang) => new Date(d).toLocaleString(lang === "ar" ? "ar" : "en-GB", { dateStyle: "medium", timeStyle: "short" });

// The System page: errors on the live site, grouped, and everyone's recent sign-ins.
export default function SystemHealth() {
  const { t, lang } = useLanguage();
  const [data, setData] = useState(null);
  const [showResolved, setShowResolved] = useState(false);
  const [open, setOpen] = useState(null);

  const load = useCallback(() => {
    api(`/api/system/errors${showResolved ? "?resolved=1" : ""}`).then(setData).catch(() => {});
  }, [showResolved]);
  useEffect(() => {
    load();
  }, [load]);

  async function resolve(id, resolved) {
    await api(`/api/system/errors/${id}`, { method: "PATCH", body: { resolved } }).catch(() => {});
    load();
  }

  const stats = data?.stats;
  return (
    <div className="space-y-6">
      <PageHeader title={t("erp.nav.system")} subtitle={t("erp.system.subtitle")} />
      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["open", stats.open, stats.open ? "text-amber-300" : "text-emerald-300"],
            ["last24h", stats.last24h, stats.last24h ? "text-amber-300" : "text-white"],
            ["logins24h", stats.logins24h, "text-white"],
            ["failedLogins24h", stats.failedLogins24h, stats.failedLogins24h ? "text-red-300" : "text-white"],
          ].map(([k, v, tone]) => (
            <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className={`text-2xl font-semibold tabular-nums ${tone}`}>{v}</p>
              <p className="text-xs text-white/60">{t(`erp.system.stat.${k}`)}</p>
            </div>
          ))}
        </div>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">{t("erp.system.errors")}</p>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-white/55">
            <input type="checkbox" className="accent-[#f37b20]" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
            {t("erp.system.showResolved")}
          </label>
        </div>
        {data && !data.errors.length && (
          <p className="flex items-center gap-2 text-sm text-emerald-300">
            <CheckCircle2 size={16} /> {t("erp.system.noErrors")}
          </p>
        )}
        <ul className="divide-y divide-white/5">
          {data?.errors.map((e) => (
            <li key={e.id} className="py-3">
              <div className="flex flex-wrap items-start gap-3">
                {e.source === "server" ? <Server size={16} className="mt-0.5 text-white/60" /> : <Globe size={16} className="mt-0.5 text-white/60" />}
                <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} className="min-w-0 flex-1 text-start">
                  <p className={`break-words text-sm ${e.resolvedAt ? "text-white/60 line-through" : "text-white/90"}`}>{e.message}</p>
                  <p className="mt-0.5 text-[11px] text-white/60" dir="ltr">
                    {e.route || e.path} · ×{e.count} · {fmt(e.lastAt, lang)}
                    {e.lastUser ? ` · ${e.lastUser}` : ""}
                  </p>
                </button>
                <ChevronDown size={14} className={`mt-1 text-white/50 transition ${open === e.id ? "rotate-180" : ""}`} />
                <button type="button" onClick={() => resolve(e.id, !e.resolvedAt)} className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-white/70 hover:bg-white/10">
                  {t(e.resolvedAt ? "erp.system.reopen" : "erp.system.resolve")}
                </button>
              </div>
              {open === e.id && (
                <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-black/30 p-3 text-[11px] leading-relaxed text-white/60" dir="ltr">
                  {t("erp.system.firstSeen")}: {fmt(e.firstAt, lang)}
                  {"\n"}
                  {e.stack || e.message}
                </pre>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <p className="mb-3 flex items-center gap-2 font-semibold">
          <AlertTriangle size={16} className="text-white/60" /> {t("erp.system.logins")}
        </p>
        <LoginHistory logins={data?.logins?.map((l) => ({ ...l, device: `${l.name} · ${l.device}` }))} />
      </Card>
    </div>
  );
}
