"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import MediaUploader from "@/components/dashboard/MediaUploader";
import TextField from "@/components/dashboard/TextField";
import ItemList, { withKeys } from "@/components/dashboard/ItemList";
import SaveBar from "@/components/dashboard/SaveBar";
import SectionHeadingFields from "@/components/dashboard/SectionHeadingFields";
import { useContentSave } from "@/components/dashboard/useContentSave";
import { isBilingualComplete } from "@/lib/validateBilingual";

export default function ClientsEditor({ initial }) {
  const { t } = useLanguage();
  const [clients, setClients] = useState(() => ({ ...initial, items: withKeys(initial.items) }));
  const { status, error, save } = useContentSave("clients");

  function handleSave() {
    save(clients, isBilingualComplete(clients.title));
  }

  return (
    <div className="space-y-6">
      <SectionHeadingFields value={clients} onChange={setClients} />
      <ItemList
        items={clients.items}
        onChange={(items) => setClients({ ...clients, items })}
        columns={2}
        addLabel={t("dashboard.addClient")}
        newItem={() => ({ name: "", logoUrl: "" })}
        renderItem={(item, update) => (
          <>
            <div>
              <label className="mb-2 block text-sm font-medium text-white/70">{t("dashboard.logo")}</label>
              <MediaUploader previewUrl={item.logoUrl} onUploaded={(logoUrl) => update({ ...item, logoUrl })} />
            </div>
            <TextField
              label={t("dashboard.clientName")}
              value={item.name}
              dir="auto"
              onChange={(name) => update({ ...item, name })}
            />
          </>
        )}
      />
      <SaveBar status={status} error={error} onSave={handleSave} />
    </div>
  );
}
