"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Mail, User, ShieldCheck, ArrowLeft } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";

export default function AuthForm() {
  const { t } = useLanguage();
  const { refresh } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState(searchParams.get("tab") === "signup" ? "signup" : "login");
  const [step, setStep] = useState("form");
  // Set once the email code passed for an account with an authenticator app: the same
  // code box then takes the app's code (/api/auth/verify-mfa).
  const [ticket, setTicket] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState("");

  useEffect(() => {
    // Reset the form back to the email step whenever the user switches tabs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep("form");
    setErrorKey("");
    setCode("");
  }, [tab]);

  const switchTab = useCallback((next) => {
    setTab(next);
  }, []);

  async function handleSendCode(e) {
    e.preventDefault();
    setErrorKey("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose: tab, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorKey(data.error || "server_error");
        return;
      }
      setStep("otp");
    } catch {
      setErrorKey("server_error");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(e) {
    e.preventDefault();
    setErrorKey("");
    setLoading(true);
    try {
      const res = ticket
        ? await fetch("/api/auth/verify-mfa", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticket, code }),
          })
        : await fetch("/api/auth/verify-otp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, code, purpose: tab }),
          });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "mfa_expired") {
          setTicket("");
          setStep("form");
        }
        setErrorKey(data.error || "server_error");
        return;
      }
      if (data.mfa) {
        setTicket(data.ticket);
        setCode("");
        return;
      }
      await refresh();
      router.push("/dashboard");
    } catch {
      setErrorKey("server_error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <Image
        src="/brand/00-Icon.png"
        alt="Octo Builders"
        width={56}
        height={56}
        className="mx-auto mb-6 h-14 w-14"
      />
      <div className="relative mx-auto mb-8 flex w-fit rounded-full border border-white/10 bg-white/5 p-1">
        {["login", "signup"].map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => switchTab(key)}
            className={`relative z-10 rounded-full px-6 py-2 text-sm font-semibold transition-colors duration-300 ${
              tab === key ? "text-white" : "text-white/70 hover:text-white"
            }`}
          >
            {tab === key && (
              <motion.span
                layoutId="auth-tab-pill"
                className="absolute inset-0 -z-10 rounded-full bg-brand-orange"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
            {t(`auth.${key}`)}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-xl">
        <AnimatePresence mode="wait">
          {step === "form" ? (
            <motion.div
              key={`form-${tab}`}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <h1 className="text-2xl font-bold text-white">{t(`auth.${tab}`)}</h1>
              <p className="mt-2 text-sm text-white/50">
                {t(tab === "signup" ? "auth.signupSubtitle" : "auth.loginSubtitle")}
              </p>

              <form onSubmit={handleSendCode} className="mt-6 space-y-4">
                {tab === "signup" && (
                  <div>
                    <label className="mb-1.5 block text-sm text-white/70">{t("auth.name")}</label>
                    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                      <User size={16} className="text-white/40" />
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t("auth.namePlaceholder")}
                        className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-sm text-white/70">{t("auth.email")}</label>
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <Mail size={16} className="text-white/40" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t("auth.emailPlaceholder")}
                      className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
                      dir="ltr"
                    />
                  </div>
                  <p className="mt-2 text-xs text-white/35">{t("auth.allowedProviders")}</p>
                </div>

                {errorKey && (
                  <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
                    {t(`errors.${errorKey}`)}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-brand-orange py-3 text-sm font-semibold text-white transition-transform hover:scale-[1.01] disabled:opacity-60"
                >
                  {loading ? t("auth.sending") : t("auth.sendCode")}
                </button>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key={ticket ? "app" : "otp"}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <button
                type="button"
                onClick={() => {
                  setTicket("");
                  setStep("form");
                }}
                className="mb-4 flex items-center gap-1 text-sm text-white/50 hover:text-white"
              >
                <ArrowLeft size={14} />
                {t("auth.changeEmail")}
              </button>

              <h1 className="text-2xl font-bold text-white">{t(ticket ? "auth.appCodeTitle" : "auth.verify")}</h1>
              {ticket ? (
                <p className="mt-2 text-sm text-white/50">{t("auth.appCodeHint")}</p>
              ) : (
                <p className="mt-2 break-all text-sm text-white/50" dir="ltr">
                  {email}
                </p>
              )}

              <form onSubmit={handleVerifyCode} className="mt-6 space-y-4">
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <ShieldCheck size={16} className="text-white/40" />
                  <input
                    type="text"
                    required
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder={t("auth.codePlaceholder")}
                    className="w-full bg-transparent text-center text-lg tracking-[0.5em] text-white outline-none placeholder:text-sm placeholder:tracking-normal placeholder:text-white/30"
                    dir="ltr"
                  />
                </div>

                {errorKey && (
                  <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
                    {t(`errors.${errorKey}`)}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="w-full rounded-xl bg-brand-orange py-3 text-sm font-semibold text-white transition-transform hover:scale-[1.01] disabled:opacity-60"
                >
                  {loading ? t("auth.verifying") : t("auth.verify")}
                </button>

                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={loading}
                  className="w-full text-center text-sm text-white/50 hover:text-white"
                >
                  {t("auth.resend")}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
