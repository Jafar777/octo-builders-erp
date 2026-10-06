"use client";

import { useLanguage } from "@/context/LanguageContext";
import { Select } from "@/components/erp/ui/fields";

// Same rule as canRouteStages() in lib/projects: the GM / CEO send stages to other departments.
export function canRouteStages(user) {
  return Boolean(user?.permissions?.includes("projects.manage") && user?.scope === "all");
}

// Which department does a stage, and does it wait for the earlier stages to finish.
export default function StageRouting({ stage, index, departments, onChange }) {
  const { t, lang } = useLanguage();
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Select
        label={t("erp.projects.stageDepartment")}
        value={stage.department || ""}
        onChange={(department) => onChange({ department: department || null })}
        placeholder={t("erp.projects.projectDepartment")}
        options={departments.map((d) => ({ value: d.id, label: d.name?.[lang] }))}
      />
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
    </div>
  );
}
