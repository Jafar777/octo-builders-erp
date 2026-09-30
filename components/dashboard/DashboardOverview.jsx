"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Globe2, Loader2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import MediaUploader from "@/components/dashboard/MediaUploader";

export default function DashboardOverview({ role }) {
  const { t } = useLanguage();
  const { user, refresh } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || "");
  const [status, setStatus] = useState("idle");

  async function handleSave() {
    setStatus("saving");
    try {
      await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, avatarUrl }),
      });
      await refresh();
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("idle");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">{t("dashboard.overview")}</h1>

      <div className="mt-8 max-w-lg space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/50">
          {t("dashboard.profile")}
        </h2>

        <MediaUploader previewUrl={avatarUrl} onUploaded={setAvatarUrl} />

        <div>
          <label className="mb-2 block text-sm font-medium text-white/70">{t("auth.name")}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-white/30"
          />
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={status === "saving"}
          className="flex items-center gap-2 rounded-xl bg-brand-orange px-6 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.01] disabled:opacity-60"
        >
          {status === "saving" && <Loader2 size={16} className="animate-spin" />}
          {status === "saved" && <Check size={16} />}
          {status === "saved" ? t("common.saved") : t("common.save")}
        </button>
      </div>

      {role === "admin" && (
        <Link
          href="/dashboard/website"
          className="mt-6 flex max-w-lg items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
            <Globe2 size={22} />
          </span>
          <div>
            <p className="font-semibold">{t("dashboard.website")}</p>
            <p className="text-sm text-white/50">Hero, About, Services, Projects, Contact</p>
          </div>
        </Link>
      )}
    </div>
  );
}
