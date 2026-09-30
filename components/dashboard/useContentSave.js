"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { hasPartialBilingual } from "@/lib/validateBilingual";

// Saves one site-content section through /api/content. `requiredOk` lets the
// editor add its own required-field check on top of the generic rule that no
// text may be filled in one language only.
export function useContentSave(section) {
  const { t } = useLanguage();
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  async function save(data, requiredOk = true) {
    if (!requiredOk || hasPartialBilingual(data)) {
      setError(t("errors.bilingual_required"));
      return false;
    }
    setError("");
    setStatus("saving");
    try {
      const res = await fetch("/api/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, data }),
      });
      if (!res.ok) throw new Error("save_failed");
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
      return true;
    } catch {
      setStatus("idle");
      setError(t("errors.save_failed"));
      return false;
    }
  }

  return { status, error, save };
}
