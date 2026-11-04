"use client";

import { Lock } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export default function NoAccess() {
  const { t } = useLanguage();
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
      <Lock size={28} className="mx-auto text-white/60" />
      <p className="mt-4 text-white/70">{t("erp.noAccess")}</p>
    </div>
  );
}
