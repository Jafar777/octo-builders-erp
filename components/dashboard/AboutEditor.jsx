"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import BilingualField from "@/components/dashboard/BilingualField";
import MediaUploader from "@/components/dashboard/MediaUploader";
import SaveBar from "@/components/dashboard/SaveBar";
import { useContentSave } from "@/components/dashboard/useContentSave";
import { isBilingualComplete } from "@/lib/validateBilingual";

export default function AboutEditor({ initial }) {
  const { t } = useLanguage();
  const [about, setAbout] = useState(initial);
  const { status, error, save } = useContentSave("about");

  function handleSave() {
    save(about, isBilingualComplete(about.title) && isBilingualComplete(about.body));
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="mb-2 block text-sm font-medium text-white/70">{t("dashboard.aboutImage")}</label>
        <MediaUploader
          previewUrl={about.imageUrl}
          onUploaded={(url) => setAbout({ ...about, imageUrl: url })}
        />
      </div>

      <BilingualField
        label={t("dashboard.title")}
        value={about.title}
        onChange={(title) => setAbout({ ...about, title })}
      />
      <BilingualField
        label={t("dashboard.body")}
        value={about.body}
        onChange={(body) => setAbout({ ...about, body })}
        textarea
      />
      <BilingualField
        label={`${t("dashboard.vision")} ${t("dashboard.optional")}`}
        value={about.vision}
        onChange={(vision) => setAbout({ ...about, vision })}
        textarea
      />
      <BilingualField
        label={`${t("dashboard.mission")} ${t("dashboard.optional")}`}
        value={about.mission}
        onChange={(mission) => setAbout({ ...about, mission })}
        textarea
      />

      <SaveBar status={status} error={error} onSave={handleSave} />
    </div>
  );
}
