"use client";

import { useState } from "react";
import { LockKeyhole, Mail } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { Button, ErrorText } from "@/components/erp/ui/fields";

// Shown where salary figures would be: emails a code, then unlocks salaries for
// 30 minutes on this browser.
export default function SalaryUnlock({ onUnlocked, compact = false }) {
  const { t } = useLanguage();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/salary-code", { method: "POST" });
      setSent(true);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  async function unlock() {
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/salary-unlock", { method: "POST", body: { code } });
      onUnlocked?.();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.03] ${compact ? "p-4" : "p-6"}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-orange/15 text-brand-orange">
          <LockKeyhole size={18} />
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="font-semibold">{t("erp.salaryLock.title")}</p>
            <p className="mt-0.5 text-sm text-white/55">{sent ? t("erp.salaryLock.sent") : t("erp.salaryLock.hint")}</p>
          </div>
          {!sent ? (
            <Button onClick={send} loading={busy}>
              <Mail size={16} /> {t("erp.salaryLock.send")}
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(e) => e.key === "Enter" && code.length === 6 && unlock()}
                inputMode="numeric"
                autoFocus
                placeholder="••••••"
                dir="ltr"
                className="w-36 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-center text-lg tracking-[0.4em] outline-none focus:border-brand-orange/60"
              />
              <Button onClick={unlock} loading={busy} disabled={code.length !== 6}>
                {t("erp.salaryLock.unlock")}
              </Button>
              <Button variant="ghost" onClick={send} disabled={busy}>
                {t("erp.salaryLock.resend")}
              </Button>
            </div>
          )}
          <ErrorText>{error}</ErrorText>
        </div>
      </div>
    </div>
  );
}
