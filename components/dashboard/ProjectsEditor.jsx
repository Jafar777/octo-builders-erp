"use client";

import { useLanguage } from "@/context/LanguageContext";
import BilingualField from "@/components/dashboard/BilingualField";
import CollectionEditor from "@/components/dashboard/CollectionEditor";
import CategorySelect from "@/components/dashboard/CategorySelect";
import GalleryUploader from "@/components/dashboard/GalleryUploader";
import MediaUploader from "@/components/dashboard/MediaUploader";
import TextField from "@/components/dashboard/TextField";
import { isBilingualComplete } from "@/lib/validateBilingual";

function emptyItem() {
  const text = () => ({ ar: "", en: "" });
  return {
    title: text(),
    description: text(),
    categories: [],
    location: text(),
    style: text(),
    designers: text(),
    client: text(),
    year: "",
    area: "",
    imageUrl: "",
    gallery: [],
    link: "",
  };
}

export default function ProjectsEditor({ section, initial }) {
  const { t } = useLanguage();
  const optional = (key) => `${t(`dashboard.${key}`)} ${t("dashboard.optional")}`;

  return (
    <CollectionEditor
      section="projects"
      endpoint="/api/projects"
      initialSection={section}
      initialItems={initial}
      emptyItem={emptyItem}
      isValid={(data) => isBilingualComplete(data.title) && isBilingualComplete(data.description)}
      addLabel={t("dashboard.addProject")}
      renderFields={(data, setData, categories) => {
        const set = (field) => (value) => setData({ ...data, [field]: value });
        return (
          <>
            <div>
              <label className="mb-2 block text-sm font-medium text-white/70">{t("dashboard.coverImage")}</label>
              <MediaUploader previewUrl={data.imageUrl} onUploaded={set("imageUrl")} />
            </div>
            <CategorySelect
              label={t("dashboard.categories")}
              categories={categories}
              value={data.categories || []}
              onChange={set("categories")}
            />
            <BilingualField label={t("dashboard.title")} value={data.title} onChange={set("title")} />
            <BilingualField label={t("dashboard.body")} value={data.description} onChange={set("description")} textarea />
            <BilingualField label={optional("location")} value={data.location} onChange={set("location")} />
            <BilingualField label={optional("style")} value={data.style} onChange={set("style")} />
            <BilingualField label={optional("client")} value={data.client} onChange={set("client")} />
            <BilingualField label={optional("designers")} value={data.designers} onChange={set("designers")} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label={optional("year")} value={data.year} placeholder="2024" onChange={set("year")} />
              <TextField label={optional("area")} value={data.area} placeholder="340 m²" onChange={set("area")} />
            </div>
            <TextField label={t("dashboard.link")} type="url" value={data.link} onChange={set("link")} />
            <div>
              <label className="mb-2 block text-sm font-medium text-white/70">{t("dashboard.gallery")}</label>
              <GalleryUploader images={data.gallery || []} onChange={set("gallery")} />
            </div>
          </>
        );
      }}
    />
  );
}
