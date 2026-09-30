"use client";

import { useLanguage } from "@/context/LanguageContext";
import BilingualField from "@/components/dashboard/BilingualField";
import CollectionEditor from "@/components/dashboard/CollectionEditor";
import IconPicker from "@/components/dashboard/IconPicker";
import CategorySelect from "@/components/dashboard/CategorySelect";
import { isBilingualComplete } from "@/lib/validateBilingual";

function emptyItem() {
  return { title: { ar: "", en: "" }, description: { ar: "", en: "" }, category: "", icon: "building", imageUrl: "" };
}

export default function ServicesEditor({ section, initial }) {
  const { t } = useLanguage();

  return (
    <CollectionEditor
      section="services"
      endpoint="/api/services"
      initialSection={section}
      initialItems={initial}
      emptyItem={emptyItem}
      isValid={(data) => isBilingualComplete(data.title) && isBilingualComplete(data.description)}
      addLabel={t("dashboard.addService")}
      renderFields={(data, setData, categories) => (
        <>
          <CategorySelect
            categories={categories}
            value={data.category ? [data.category] : []}
            onChange={(keys) => setData({ ...data, category: keys[keys.length - 1] || "" })}
          />
          <IconPicker value={data.icon} onChange={(icon) => setData({ ...data, icon })} />
          <BilingualField label={t("dashboard.title")} value={data.title} onChange={(title) => setData({ ...data, title })} />
          <BilingualField
            label={t("dashboard.body")}
            value={data.description}
            onChange={(description) => setData({ ...data, description })}
            textarea
          />
        </>
      )}
    />
  );
}
