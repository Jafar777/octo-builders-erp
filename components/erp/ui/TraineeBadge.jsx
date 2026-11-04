"use client";

import { createContext, useContext } from "react";
import { GraduationCap } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

// Ids of the trainees, given only to the GM / CEO (app/dashboard/layout.js): everyone
// else gets an empty set, so the badge never shows for them.
const TraineeContext = createContext(new Set());

export function TraineeProvider({ ids, children }) {
  return <TraineeContext.Provider value={ids}>{children}</TraineeContext.Provider>;
}

export function useIsTrainee(id) {
  return useContext(TraineeContext).has(id);
}

// A small "Trainee" pill next to a person's name.
export default function TraineeBadge({ id, className = "" }) {
  const { t } = useLanguage();
  if (!useIsTrainee(id)) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-sky-400/30 bg-sky-400/10 px-1.5 py-px align-middle text-[10px] font-semibold leading-4 text-sky-300 ${className}`}
      title={t("erp.training.trainee")}
    >
      <GraduationCap size={11} />
      {t("erp.training.trainee")}
    </span>
  );
}
