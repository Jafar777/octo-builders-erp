"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import BilingualField from "@/components/dashboard/BilingualField";
import ItemList, { withKeys } from "@/components/dashboard/ItemList";
import SaveBar from "@/components/dashboard/SaveBar";
import SectionHeadingFields from "@/components/dashboard/SectionHeadingFields";
import { useContentSave } from "@/components/dashboard/useContentSave";
import { isBilingualComplete } from "@/lib/validateBilingual";

export default function ProcessEditor({ initial }) {
  const { t } = useLanguage();
  const [workflow, setWorkflow] = useState(() => ({ ...initial, items: withKeys(initial.items) }));
  const { status, error, save } = useContentSave("process");

  function handleSave() {
    save(
      workflow,
      isBilingualComplete(workflow.title) &&
        workflow.items.every((s) => isBilingualComplete(s.title) && isBilingualComplete(s.description))
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeadingFields value={workflow} onChange={setWorkflow} />
      <ItemList
        items={workflow.items}
        onChange={(items) => setWorkflow({ ...workflow, items })}
        addLabel={t("dashboard.addStep")}
        newItem={() => ({ title: { ar: "", en: "" }, description: { ar: "", en: "" } })}
        renderItem={(item, update) => (
          <>
            <BilingualField label={t("dashboard.title")} value={item.title} onChange={(title) => update({ ...item, title })} />
            <BilingualField
              label={t("dashboard.body")}
              value={item.description}
              onChange={(description) => update({ ...item, description })}
              textarea
            />
          </>
        )}
      />
      <SaveBar status={status} error={error} onSave={handleSave} />
    </div>
  );
}
