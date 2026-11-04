"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, KeyRound, ShieldAlert, Smartphone } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { api, errorText } from "@/lib/clientApi";
import { Button, Card, ErrorText } from "@/components/erp/ui/fields";

const fmt = (d, lang) => new Date(d).toLocaleString(lang === "ar" ? "ar" : "en-GB", { dateStyle: "medium", timeStyle: "short" });

// A list of sign-ins: when, device, IP, and failed attempts in red.
export function LoginHistory({ logins }) {
  const { t, lang } = useLanguage();
  if (!logins?.length) return <p className="text-xs text-white/55">{t("erp.security.noLogins")}</p>;
  return (
    <ul className="divide-y divide-white/5 text-xs">
      {logins.map((l) => (
        <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${l.success ? "bg-emerald-400" : "bg-red-400"}`} />
            <span className="text-white/80">{l.device}</span>
            {l.method === "email+app" && <KeyRound size={12} className="text-white/60" />}
            {!l.success && <span className="text-red-300">{t(`erp.security.reason.${l.reason || "invalid_code"}`)}</span>}
          </span>
          <span className="text-white/60" dir="ltr">
            {fmt(l.at, lang)}
            {l.ip ? ` · ${l.ip}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

// Profile → Security: set up / remove the authenticator app, and my recent sign-ins.
// `forced` = the role requires it and it isn't set up yet (the dashboard shows only this).
export default function SecurityCard({ forced = false }) {
  const { t } = useLanguage();
  const { refresh } = useAuth();
  const [data, setData] = useState(null);
  const [setup, setSetup] = useState(null); // { secret, qr }
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api("/api/auth/mfa").then(setData).catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function act(action) {
    setBusy(true);
    setError("");
    try {
      if (action === "setup") {
        setSetup(await api("/api/auth/mfa", { method: "POST", body: { action } }));
      } else {
        await api("/api/auth/mfa", { method: "POST", body: { action, code } });
        setSetup(null);
        setCode("");
        load();
        await refresh?.();
        if (forced) window.location.reload();
      }
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  const codeInput = (
    <input
      value={code}
      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
      inputMode="numeric"
      dir="ltr"
      placeholder="000000"
      aria-label={t("erp.security.code")}
      className="w-36 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-center text-lg tracking-[0.4em] outline-none focus:border-white/30"
    />
  );

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <Smartphone size={20} className="mt-0.5 text-brand-orange" />
          <div>
            <p className="font-semibold">{t("erp.security.title")}</p>
            <p className="mt-1 text-sm text-white/50">{t("erp.security.hint")}</p>
          </div>
        </div>

        {forced && (
          <p className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">
            <ShieldAlert size={16} className="mt-0.5 shrink-0" /> {t("erp.security.forced")}
          </p>
        )}

        {data?.enabled && !setup ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm text-emerald-300">
              <CheckCircle2 size={16} /> {t("erp.security.on")}
            </p>
            {!data.required && (
              <div className="flex flex-wrap items-center gap-2">
                {codeInput}
                <Button variant="danger" onClick={() => act("disable")} loading={busy} disabled={code.length !== 6}>
                  {t("erp.security.turnOff")}
                </Button>
              </div>
            )}
            {data.required && <p className="text-xs text-white/60">{t("erp.security.requiredByRole")}</p>}
          </div>
        ) : setup ? (
          <div className="space-y-3">
            <ol className="list-decimal space-y-1 ps-5 text-sm text-white/70">
              <li>{t("erp.security.step1")}</li>
              <li>{t("erp.security.step2")}</li>
              <li>{t("erp.security.step3")}</li>
            </ol>
            <div className="flex flex-wrap items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qr} alt={t("erp.security.qrAlt")} width={180} height={180} className="rounded-xl bg-white p-2" />
              <div className="min-w-0 space-y-1">
                <p className="text-xs text-white/60">{t("erp.security.manual")}</p>
                <code className="block select-all break-all rounded-lg bg-black/30 px-3 py-2 text-sm" dir="ltr">
                  {setup.secret.match(/.{1,4}/g).join(" ")}
                </code>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {codeInput}
              <Button onClick={() => act("enable")} loading={busy} disabled={code.length !== 6}>
                {t("erp.security.confirm")}
              </Button>
              <Button variant="ghost" onClick={() => setSetup(null)}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => act("setup")} loading={busy}>
            <KeyRound size={16} /> {t("erp.security.setUp")}
          </Button>
        )}
        <ErrorText>{error}</ErrorText>

        {!forced && (
          <div className="border-t border-white/10 pt-4">
            <p className="mb-2 text-sm font-medium text-white/70">{t("erp.security.history")}</p>
            <LoginHistory logins={data?.logins} />
          </div>
        )}
      </div>
    </Card>
  );
}
