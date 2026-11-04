"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import SaveBar from "@/components/dashboard/SaveBar";
import SectionHeadingFields from "@/components/dashboard/SectionHeadingFields";
import CategoriesField from "@/components/dashboard/CategoriesField";
import { ItemControls, moveItem, withKeys } from "@/components/dashboard/ItemList";
import { useContentSave } from "@/components/dashboard/useContentSave";
import { hasPartialBilingual, isBilingualComplete } from "@/lib/validateBilingual";
import { useConfirm } from "@/components/erp/ui/Feedback";

function ItemCard({ endpoint, item, isValid, renderFields, onSaved, onDeleted, controls }) {
  const { t } = useLanguage();
  const confirm = useConfirm();
  const [data, setData] = useState(item);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleSave() {
    if (!isValid(data) || hasPartialBilingual(data)) {
      setError(t("errors.bilingual_required"));
      return;
    }
    setError("");
    setStatus("saving");
    try {
      const res = await fetch(item.id ? `${endpoint}/${item.id}` : endpoint, {
        method: item.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("save_failed");
      if (item.id) {
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 1500);
        onSaved({ ...data, id: item.id });
      } else {
        const result = await res.json();
        setStatus("idle");
        onSaved({ ...data, id: result.id });
      }
    } catch {
      setStatus("idle");
      setError(t("errors.save_failed"));
    }
  }

  async function handleDelete() {
    if (!item.id) {
      onDeleted();
      return;
    }
    if (!(await confirm({ text: t("common.confirmDelete"), kind: "delete" }))) return;
    setDeleting(true);
    await fetch(`${endpoint}/${item.id}`, { method: "DELETE" });
    onDeleted();
  }

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      {item.id && <div className="flex justify-end">{controls}</div>}
      {renderFields(data, setData)}
      <div className="flex flex-wrap items-end gap-3">
        <SaveBar status={status} error={error} onSave={handleSave} small />
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

// Section heading + categories (stored in site content) on top, and the
// database-backed items (services or projects) below, each saved on its own.
export default function CollectionEditor({
  section,
  endpoint,
  initialSection,
  initialItems,
  emptyItem,
  isValid,
  addLabel,
  renderFields,
}) {
  const { t } = useLanguage();
  const [meta, setMeta] = useState(() => ({ ...initialSection, categories: withKeys(initialSection.categories) }));
  const [items, setItems] = useState(() => initialItems.map((it) => ({ ...it, _key: it.id })));
  const { status, error, save } = useContentSave(section);

  function handleSaveSection() {
    save(meta, isBilingualComplete(meta.title) && meta.categories.every((c) => isBilingualComplete(c.name)));
  }

  function move(from, to) {
    const next = moveItem(items, from, to);
    setItems(next);
    fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: next.filter((it) => it.id).map((it) => it.id) }),
    });
  }

  const savedCount = items.filter((it) => it.id).length;

  return (
    <div className="space-y-10">
      <div className="space-y-6">
        <SectionHeadingFields value={meta} onChange={setMeta} />
        <CategoriesField value={meta.categories} onChange={(categories) => setMeta({ ...meta, categories })} />
        <SaveBar status={status} error={error} onSave={handleSaveSection} label={t("dashboard.saveSection")} />
      </div>

      <div className="space-y-6 border-t border-white/10 pt-8">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">{t("dashboard.items")}</h3>
        <div className="grid gap-6 xl:grid-cols-2">
          {items.map((item, idx) => {
            const savedIndex = items.slice(0, idx).filter((it) => it.id).length;
            return (
              <ItemCard
                key={item._key}
                endpoint={endpoint}
                item={item}
                isValid={isValid}
                renderFields={(data, setData) => renderFields(data, setData, meta.categories)}
                onSaved={(saved) =>
                  setItems((prev) => prev.map((it) => (it._key === item._key ? { ...saved, _key: item._key } : it)))
                }
                onDeleted={() => setItems((prev) => prev.filter((it) => it._key !== item._key))}
                controls={
                  <ItemControls
                    index={savedIndex}
                    count={savedCount}
                    onMove={(to) => move(idx, idx + (to - savedIndex))}
                  />
                }
              />
            );
          })}
        </div>

        {items.length === 0 && <p className="text-sm text-white/60">{t("dashboard.noItems")}</p>}

        <button
          type="button"
          onClick={() => setItems((prev) => [...prev, { ...emptyItem(), _key: `new-${Date.now()}` }])}
          className="flex items-center gap-2 rounded-xl border border-dashed border-white/20 px-5 py-3 text-sm font-medium text-white/70 transition-colors hover:border-white/40 hover:text-white"
        >
          <Plus size={16} />
          {addLabel}
        </button>
      </div>
    </div>
  );
}
