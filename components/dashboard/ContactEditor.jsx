"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import BilingualField from "@/components/dashboard/BilingualField";
import { isBilingualComplete } from "@/lib/validateBilingual";

export default function ContactEditor({ initial }) {
  const { t } = useLanguage();
  const [contact, setContact] = useState(initial);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  async function handleSave() {
    if (!isBilingualComplete(contact.title) || !isBilingualComplete(contact.body)) {
      setError(t("errors.bilingual_required"));
      return;
    }
    setError("");
    setStatus("saving");
    try {
      await fetch("/api/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "contact", data: contact }),
      });
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("idle");
    }
  }

  return (
    <div className="space-y-6">
      <BilingualField
        label={t("dashboard.title")}
        value={contact.title}
        onChange={(title) => setContact({ ...contact, title })}
      />
      <BilingualField
        label={t("dashboard.body")}
        value={contact.body}
        onChange={(body) => setContact({ ...contact, body })}
        textarea
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-white/70">{t("dashboard.email")}</label>
          <input
            type="email"
            dir="ltr"
            value={contact.email || ""}
            onChange={(e) => setContact({ ...contact, email: e.target.value })}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-white/30"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-white/70">{t("dashboard.phone")}</label>
          <input
            type="text"
            dir="ltr"
            value={contact.phone || ""}
            onChange={(e) => setContact({ ...contact, phone: e.target.value })}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-white/30"
          />
        </div>
      </div>

      <BilingualField
        label={t("dashboard.address")}
        value={contact.address}
        onChange={(address) => setContact({ ...contact, address })}
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
