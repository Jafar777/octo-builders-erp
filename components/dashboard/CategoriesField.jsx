"use client";

import { useLanguage } from "@/context/LanguageContext";
import BilingualField from "@/components/dashboard/BilingualField";
import ItemList from "@/components/dashboard/ItemList";

// Categories are stored as { key, name }. The key is what services/projects
// reference, so it is generated once and never shown or edited.
export default function CategoriesField({ value, onChange }) {
  const { t } = useLanguage();

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">{t("dashboard.categories")}</h3>
      <p className="text-xs text-white/40">{t("dashboard.categoriesHint")}</p>
      <ItemList
        items={value}
        onChange={onChange}
        columns={2}
        addLabel={t("dashboard.addCategory")}
        newItem={() => ({ key: `cat-${Date.now().toString(36)}`, name: { ar: "", en: "" } })}
        renderItem={(item, update) => (
          <BilingualField
            label={t("dashboard.categoryName")}
            value={item.name}
            onChange={(name) => update({ ...item, name })}
          />
        )}
      />
    </div>
  );
}
