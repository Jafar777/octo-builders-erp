"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import Modal from "@/components/erp/ui/Modal";
import { Button, ErrorText, Input } from "@/components/erp/ui/fields";

export default function Clients({ lookups, canManage }) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    try {
      if (editing.id) await api(`/api/finance/clients/${editing.id}`, { method: "PATCH", body: editing });
      else await api("/api/finance/clients", { method: "POST", body: editing });
      setEditing(null);
      lookups.reloadClients();
    } catch (err) {
      setError(errorText(t, err));
    }
  }
  async function remove(c) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await api(`/api/finance/clients/${c.id}`, { method: "DELETE" });
      lookups.reloadClients();
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  return (
    <div className="max-w-3xl space-y-3">
      {canManage && (
        <Button onClick={() => setEditing({ name: "", phone: "", email: "", notes: "" })}>
          <Plus size={16} /> {t("erp.finance.newClient")}
        </Button>
      )}
      <ErrorText>{!editing && error}</ErrorText>
      {lookups.clients.map((c) => (
        <div key={c.id} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{c.name}</p>
            <p className="text-xs text-white/45" dir="ltr">{[c.phone, c.email].filter(Boolean).join(" · ")}</p>
          </div>
          {canManage && (
            <>
              <button type="button" onClick={() => setEditing(c)} className="text-white/50 hover:text-white" aria-label={t("common.edit")}><Pencil size={14} /></button>
              <button type="button" onClick={() => remove(c)} className="text-red-400" aria-label={t("common.delete")}><Trash2 size={14} /></button>
            </>
          )}
        </div>
      ))}
      {lookups.clients.length === 0 && <p className="py-8 text-center text-white/40">{t("dashboard.noItems")}</p>}
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={t("erp.finance.client")}>
        {editing && (
          <div className="space-y-4">
            <Input label={t("erp.org.name")} value={editing.name} onChange={(name) => setEditing((c) => ({ ...c, name }))} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label={t("erp.staff.phone")} value={editing.phone} onChange={(phone) => setEditing((c) => ({ ...c, phone }))} dir="ltr" />
              <Input label={t("auth.email")} value={editing.email} onChange={(email) => setEditing((c) => ({ ...c, email }))} dir="ltr" />
            </div>
            <Input label={t("erp.hr.note")} value={editing.notes} onChange={(notes) => setEditing((c) => ({ ...c, notes }))} />
            <ErrorText>{error}</ErrorText>
            <Button onClick={save}>{t("common.save")}</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
