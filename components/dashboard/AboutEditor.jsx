"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import BilingualField from "@/components/dashboard/BilingualField";
import MediaUploader from "@/components/dashboard/MediaUploader";
import { isBilingualComplete } from "@/lib/validateBilingual";

export default function AboutEditor({ initial }) {
  const { t } = useLanguage();
  const [about, setAbout] = useState(initial);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  async function handleSave() {
    if (!isBilingualComplete(about.title) || !isBilingualComplete(about.body)) {
      setError(t("errors.bilingual_required"));
      return;
    }
    setError("");
    setStatus("saving");
    try {
      await fetch("/api/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "about", data: about }),
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
        <label className="mb-2 block text-sm font-medium text-white/70">{t("dashboard.aboutImage")}</label>
        <MediaUploader
          previewUrl={about.imageUrl}
          onUploaded={(url) => setAbout({ ...about, imageUrl: url })}
        />
      </div>

      <BilingualField
        label={t("dashboard.title")}
        value={about.title}
        onChange={(title) => setAbout({ ...about, title })}
      />
      <BilingualField
        label={t("dashboard.body")}
        value={about.body}
        onChange={(body) => setAbout({ ...about, body })}
        textarea
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
