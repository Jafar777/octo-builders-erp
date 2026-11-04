"use client";

import { useState } from "react";
import { CheckSquare, Square, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";

// The task's steps. Ticking them moves the task's progress on the Gantt.
export default function TaskChecklist({ taskId, items, canEdit }) {
  const { t } = useLanguage();
  const [list, setList] = useState(items || []);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  async function send(body) {
    setError("");
    try {
      const res = await api(`/api/tasks/${taskId}/checklist`, { method: "PATCH", body });
      setList(res.checklist);
    } catch (err) {
      setError(errorText(t, err));
    }
  }
  if (!canEdit && !list.length) return null;
  const done = list.filter((c) => c.done).length;
  return (
    <div className="rounded-2xl border border-white/10 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">{t("erp.checklist.title")}</p>
        {list.length > 0 && (
          <span className="text-xs tabular-nums text-white/50">
            {done}/{list.length}
          </span>
        )}
      </div>
      {list.length > 0 && (
        <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-emerald-400" style={{ width: `${(done / list.length) * 100}%` }} />
        </div>
      )}
      <ul className="space-y-1">
        {list.map((c) => (
          <li key={c.id} className="group flex items-center gap-2 text-sm">
            <button type="button" disabled={!canEdit} onClick={() => send({ toggle: c.id })} className={c.done ? "text-emerald-300" : "text-white/60 hover:text-white"} aria-label={c.text}>
              {c.done ? <CheckSquare size={16} /> : <Square size={16} />}
            </button>
            <span className={`flex-1 ${c.done ? "text-white/60 line-through" : ""}`}>{c.text}</span>
            {canEdit && (
              <button type="button" onClick={() => send({ remove: c.id })} aria-label={t("common.delete")} className="text-white/60 opacity-0 hover:text-red-300 group-hover:opacity-100">
                <Trash2 size={13} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            send({ add: text });
            setText("");
          }}
          className="mt-2"
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("erp.checklist.add")} aria-label={t("erp.checklist.add")} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none focus:border-white/30" />
        </form>
      )}
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}
