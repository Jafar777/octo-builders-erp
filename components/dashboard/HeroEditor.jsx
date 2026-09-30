"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import BilingualField from "@/components/dashboard/BilingualField";
import MediaUploader from "@/components/dashboard/MediaUploader";
import { isBilingualComplete } from "@/lib/validateBilingual";

export default function HeroEditor({ initial }) {
  const { t } = useLanguage();
  const [hero, setHero] = useState(initial);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  async function handleSave() {
    if (!isBilingualComplete(hero.title) || !isBilingualComplete(hero.subtitle)) {
      setError(t("errors.bilingual_required"));
      return;
    }
    setError("");
    setStatus("saving");
    try {
      await fetch("/api/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "hero", data: hero }),
      });
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("idle");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="mb-2 block text-sm font-medium text-white/70">{t("dashboard.heroMediaType")}</label>
        <div className="flex gap-2">
          {["image", "video"].map((typeOption) => (
            <button
              key={typeOption}
              type="button"
              onClick={() => setHero({ ...hero, mediaType: typeOption })}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                hero.mediaType === typeOption
                  ? "bg-brand-orange text-white"
                  : "border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              {t(`dashboard.${typeOption}`)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-white/70">{t("dashboard.heroMedia")}</label>
        <MediaUploader
          kind={hero.mediaType}
          accept={hero.mediaType === "video" ? "video/*" : "image/*"}
          previewUrl={hero.mediaUrl}
          onUploaded={(url) => setHero({ ...hero, mediaUrl: url })}
        />
      </div>

      <BilingualField
        label={t("dashboard.title")}
        value={hero.title}
        onChange={(title) => setHero({ ...hero, title })}
      />
      <BilingualField
        label={t("dashboard.subtitle")}
        value={hero.subtitle}
        onChange={(subtitle) => setHero({ ...hero, subtitle })}
      />

      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={status === "saving"}
        className="flex items-center gap-2 rounded-xl bg-brand-orange px-6 py-3 text-sm font-semibold text-white transition-transform hover:scale-[1.01] disabled:opacity-60"
      >
        {status === "saving" && <Loader2 size={16} className="animate-spin" />}
        {status === "saved" && <Check size={16} />}
        {status === "saved" ? t("common.saved") : t("common.save")}
      </button>
    </div>
  );
}
