"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import BilingualField from "@/components/dashboard/BilingualField";
import TextField from "@/components/dashboard/TextField";
import SaveBar from "@/components/dashboard/SaveBar";
import { useContentSave } from "@/components/dashboard/useContentSave";
import { isBilingualComplete } from "@/lib/validateBilingual";

export default function ContactEditor({ initial }) {
  const { t } = useLanguage();
  const [contact, setContact] = useState(initial);
  const { status, error, save } = useContentSave("contact");

  function set(field) {
    return (value) => setContact({ ...contact, [field]: value });
  }

  function handleSave() {
    save(contact, isBilingualComplete(contact.title) && isBilingualComplete(contact.body));
  }

  return (
    <div className="space-y-6">
      <BilingualField label={t("dashboard.title")} value={contact.title} onChange={set("title")} />
      <BilingualField label={t("dashboard.body")} value={contact.body} onChange={set("body")} textarea />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label={t("dashboard.email")} type="email" value={contact.email} onChange={set("email")} />
        <TextField label={t("dashboard.phone")} value={contact.phone} onChange={set("phone")} />
        <TextField label={t("dashboard.whatsapp")} value={contact.whatsapp} placeholder="+966..." onChange={set("whatsapp")} />
        <TextField label={t("dashboard.website")} type="url" value={contact.website} onChange={set("website")} />
        <TextField label={t("dashboard.instagram")} value={contact.instagram} onChange={set("instagram")} />
      </div>

      <BilingualField label={t("dashboard.address")} value={contact.address} onChange={set("address")} />

      <SaveBar status={status} error={error} onSave={handleSave} />
    </div>
  );
}
