"use client";

import { ArrowDownToLine, Layers, Shuffle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { Select } from "@/components/erp/ui/fields";

// Same rule as canRouteStages() in lib/projects: the GM / CEO send stages to other departments.
export function canRouteStages(user) {
  return Boolean(user?.permissions?.includes("projects.manage") && user?.scope === "all");
}

export const PROJECT_FLOWS = ["ordered", "random", "mixed"];
const FLOW_ICON = { ordered: ArrowDownToLine, random: Shuffle, mixed: Layers };

// Which department does a stage (GM / CEO only), and — in mixed projects — does it
// wait for the earlier stages to finish.
export default function StageRouting({ stage, index, departments, onChange, canRoute = true, flow = "mixed" }) {
  const { t, lang } = useLanguage();
  const showWait = flow === "mixed";
  if (!canRoute && !showWait) return null;
  return (
    <div className={`grid gap-2 ${canRoute && showWait ? "sm:grid-cols-2" : ""}`}>
      {canRoute && (
        <Select
          label={t("erp.projects.stageDepartment")}
          value={stage.department || ""}
          onChange={(department) => onChange({ department: department || null })}
          placeholder={t("erp.projects.projectDepartment")}
          options={departments.map((d) => ({ value: d.id, label: d.name?.[lang] }))}
        />
      )}
      {showWait && (
        <Select
          label={t("erp.projects.stageStart")}
          value={stage.waitForPrevious ? "after" : "together"}
          onChange={(v) => onChange({ waitForPrevious: v === "after" })}
          disabled={index === 0}
          options={[
            { value: "together", label: t("erp.projects.startTogether") },
            { value: "after", label: t("erp.projects.startAfter") },
          ]}
        />
      )}
    </div>
  );
}

// The three project types as cards: ordered / random / mixed.
export function FlowSelect({ value, onChange }) {
  const { t } = useLanguage();
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-white/70">{t("erp.flow.label")}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {PROJECT_FLOWS.map((f) => {
          const Icon = FLOW_ICON[f];
          const on = value === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => onChange(f)}
              aria-pressed={on}
              className={`rounded-xl border p-3 text-start transition-colors ${on ? "border-brand-orange bg-brand-orange/10" : "border-white/10 hover:bg-white/5"}`}
            >
              <span className={`flex items-center gap-2 text-sm font-semibold ${on ? "text-white" : "text-white/80"}`}>
                <Icon size={16} className={on ? "text-brand-orange" : "text-white/50"} /> {t(`erp.flow.${f}`)}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-white/50">{t(`erp.flow.${f}Hint`)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FlowBadge({ flow }) {
  const { t } = useLanguage();
  if (!flow) return null;
  const Icon = FLOW_ICON[flow];
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-xs" title={t(`erp.flow.${flow}Hint`)}>
      <Icon size={12} /> {t(`erp.flow.${flow}`)}
    </span>
  );
}
