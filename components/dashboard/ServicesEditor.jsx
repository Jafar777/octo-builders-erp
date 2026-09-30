"use client";

import { useState } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import BilingualField from "@/components/dashboard/BilingualField";
import MediaUploader from "@/components/dashboard/MediaUploader";
import { isBilingualComplete } from "@/lib/validateBilingual";

function emptyItem() {
  return { title: { ar: "", en: "" }, description: { ar: "", en: "" }, imageUrl: "" };
}

function ServiceCard({ item, onSaved, onDeleted }) {
  const { t } = useLanguage();
  const [data, setData] = useState(item);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleSave() {
    if (!isBilingualComplete(data.title) || !isBilingualComplete(data.description)) {
      setError(t("errors.bilingual_required"));
      return;
    }
    setError("");
    setStatus("saving");
    try {
      if (item.id) {
        await fetch(`/api/services/${item.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 1500);
      } else {
        const res = await fetch("/api/services", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const result = await res.json();
        setStatus("idle");
        onSaved({ ...data, id: result.id });
      }
    } catch {
      setStatus("idle");
    }
  }

  async function handleDelete() {
    if (!item.id) {
      onDeleted();
      return;
    }
    if (!window.confirm(t("common.confirmDelete"))) return;
    setDeleting(true);
    await fetch(`/api/services/${item.id}`, { method: "DELETE" });
    onDeleted();
  }

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <MediaUploader previewUrl={data.imageUrl} onUploaded={(url) => setData({ ...data, imageUrl: url })} />
      <BilingualField label={t("dashboard.title")} value={data.title} onChange={(title) => setData({ ...data, title })} />
      <BilingualField
        label={t("dashboard.body")}
        value={data.description}
        onChange={(description) => setData({ ...data, description })}
        textarea
      />
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={status === "saving"}
          className="flex items-center gap-2 rounded-xl bg-brand-orange px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.01] disabled:opacity-60"
        >
          {status === "saving" && <Loader2 size={14} className="animate-spin" />}
          {status === "saved" && <Check size={14} />}
          {status === "saved" ? t("common.saved") : t("common.save")}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="flex items-center gap-2 rounded-xl border border-red-500/30 px-5 py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-60"
        >
          {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          {t("common.delete")}
        </button>
      </div>
    </div>
  );
}

export default function ServicesEditor({ initial }) {
  const { t } = useLanguage();
  const [items, setItems] = useState(initial);

  function handleAdd() {
    setItems((prev) => [...prev, { ...emptyItem(), _key: Date.now() }]);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        {items.map((item, idx) => (
          <ServiceCard
            key={item.id || item._key}
            item={item}
            onSaved={(saved) =>
              setItems((prev) => prev.map((it, i) => (i === idx ? saved : it)))
            }
            onDeleted={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
          />
        ))}
      </div>

      {items.length === 0 && <p className="text-sm text-white/40">{t("dashboard.noItems")}</p>}

      <button
        type="button"
        onClick={handleAdd}
        className="flex items-center gap-2 rounded-xl border border-dashed border-white/20 px-5 py-3 text-sm font-medium text-white/70 transition-colors hover:border-white/40 hover:text-white"
      >
        <Plus size={16} />
        {t("dashboard.addService")}
      </button>
    </div>
  );
}
