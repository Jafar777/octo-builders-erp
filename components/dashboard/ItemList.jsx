"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export function moveItem(list, from, to) {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

let keyCounter = 0;
function newKey() {
  keyCounter += 1;
  return `k${Date.now().toString(36)}${keyCounter}`;
}

// Gives each list item a stable React key so inputs keep focus while items are
// reordered. The `_key` field is dropped by the strict Mongoose schema on save.
export function withKeys(list) {
  return (list || []).map((item) => (item._key ? item : { ...item, _key: newKey() }));
}

export function ItemControls({ index, count, onMove, onRemove }) {
  const { t } = useLanguage();
  const btn =
    "flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className={btn} onClick={() => onMove(index - 1)} disabled={index === 0} aria-label={t("dashboard.moveUp")} title={t("dashboard.moveUp")}>
        <ArrowUp size={14} />
      </button>
      <button type="button" className={btn} onClick={() => onMove(index + 1)} disabled={index === count - 1} aria-label={t("dashboard.moveDown")} title={t("dashboard.moveDown")}>
        <ArrowDown size={14} />
      </button>
      {onRemove && (
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/30 text-red-400 transition-colors hover:bg-red-500/10"
          onClick={onRemove}
          aria-label={t("dashboard.remove")}
          title={t("dashboard.remove")}
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

// Editable, reorderable list of plain objects stored inside a site-content section.
export default function ItemList({ items, onChange, newItem, addLabel, renderItem, columns = 1 }) {
  const { t } = useLanguage();
  function update(index, value) {
    onChange(items.map((it, i) => (i === index ? value : it)));
  }

  function move(from, to) {
    onChange(moveItem(items, from, to));
  }

  function remove(index) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      <div className={`grid gap-4 ${columns === 2 ? "lg:grid-cols-2" : ""}`}>
        {items.map((item, i) => (
          <div key={item._key || i} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between">
              <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-white/10 px-2 text-xs font-semibold text-white/70">
                {i + 1}
              </span>
              <ItemControls index={i} count={items.length} onMove={(to) => move(i, to)} onRemove={() => remove(i)} />
            </div>
            {renderItem(item, (value) => update(i, value))}
          </div>
        ))}
      </div>

      {items.length === 0 && <p className="text-sm text-white/60">{t("dashboard.noItems")}</p>}

      <button
        type="button"
        onClick={() => onChange([...items, { ...newItem(), _key: newKey() }])}
        className="flex items-center gap-2 rounded-xl border border-dashed border-white/20 px-5 py-3 text-sm font-medium text-white/70 transition-colors hover:border-white/40 hover:text-white"
      >
        <Plus size={16} />
        {addLabel}
      </button>
    </div>
  );
}
