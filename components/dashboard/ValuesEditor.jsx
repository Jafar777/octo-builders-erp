"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import BilingualField from "@/components/dashboard/BilingualField";
import IconPicker from "@/components/dashboard/IconPicker";
import ItemList, { withKeys } from "@/components/dashboard/ItemList";
import SaveBar from "@/components/dashboard/SaveBar";
import SectionHeadingFields from "@/components/dashboard/SectionHeadingFields";
import { useContentSave } from "@/components/dashboard/useContentSave";
import { isBilingualComplete } from "@/lib/validateBilingual";

export default function ValuesEditor({ initial }) {
  const { t } = useLanguage();
  const [values, setValues] = useState(() => ({ ...initial, items: withKeys(initial.items) }));
  const { status, error, save } = useContentSave("values");

  function handleSave() {
    save(
      values,
      isBilingualComplete(values.title) &&
        values.items.every((v) => isBilingualComplete(v.title) && isBilingualComplete(v.description))
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeadingFields value={values} onChange={setValues} />
      <ItemList
        items={values.items}
        onChange={(items) => setValues({ ...values, items })}
        columns={2}
        addLabel={t("dashboard.addValue")}
        newItem={() => ({ icon: "award", title: { ar: "", en: "" }, description: { ar: "", en: "" } })}
        renderItem={(item, update) => (
          <>
            <IconPicker value={item.icon} onChange={(icon) => update({ ...item, icon })} />
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
