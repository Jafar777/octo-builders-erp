"use client";

import { ArrowDownToLine, Layers, Shuffle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { Select } from "@/components/erp/ui/fields";

// Same rule as canRouteStages() in lib/projects: the GM / CEO send stages to other departments.
export function canRouteStages(user) {
  return Boolean(user?.permissions?.includes("projects.manage") && user?.scope === "all");
}

const FLOW_ICON = { ordered: ArrowDownToLine, random: Shuffle, mixed: Layers };

// Which department does a stage's work (GM / CEO only). What a stage waits for is
// set in StageFlowEditor.
export default function StageRouting({ stage, departments, onChange }) {
  const { t, lang } = useLanguage();
  return (
    <Select
      label={t("erp.projects.stageDepartment")}
      value={stage.department || ""}
      onChange={(department) => onChange({ department: department || null })}
      placeholder={t("erp.projects.projectDepartment")}
      options={departments.map((d) => ({ value: d.id, label: d.name?.[lang] }))}
    />
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
