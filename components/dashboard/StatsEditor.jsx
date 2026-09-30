"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import BilingualField from "@/components/dashboard/BilingualField";
import TextField from "@/components/dashboard/TextField";
import ItemList, { withKeys } from "@/components/dashboard/ItemList";
import SaveBar from "@/components/dashboard/SaveBar";
import { useContentSave } from "@/components/dashboard/useContentSave";
import { isBilingualComplete } from "@/lib/validateBilingual";

export default function StatsEditor({ initial }) {
  const { t } = useLanguage();
  const [stats, setStats] = useState(() => ({ ...initial, items: withKeys(initial.items) }));
  const { status, error, save } = useContentSave("stats");

  function handleSave() {
    save(stats, stats.items.every((s) => s.value?.trim() && isBilingualComplete(s.label)));
  }

  return (
    <div className="space-y-6">
      <ItemList
        items={stats.items}
        onChange={(items) => setStats({ ...stats, items })}
        columns={2}
        addLabel={t("dashboard.addStat")}
        newItem={() => ({ value: "", label: { ar: "", en: "" } })}
        renderItem={(item, update) => (
          <>
            <TextField
              label={t("dashboard.statValue")}
              value={item.value}
              placeholder="14+"
              onChange={(value) => update({ ...item, value })}
            />
            <BilingualField
              label={t("dashboard.statLabel")}
              value={item.label}
              onChange={(label) => update({ ...item, label })}
            />
          </>
        )}
      />
      <SaveBar status={status} error={error} onSave={handleSave} />
    </div>
  );
}
