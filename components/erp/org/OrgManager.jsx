"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import BilingualField from "@/components/dashboard/BilingualField";
import Modal from "@/components/erp/ui/Modal";
import { Button, ErrorText, Input, PageHeader, Toggle } from "@/components/erp/ui/fields";
import OrgChart from "@/components/erp/org/OrgChart";

const TYPES = ["departments", "branches", "jobTitles"];

const EMPTY = {
  departments: { name: { ar: "", en: "" }, code: "", color: "#f37b20", active: true },
  branches: { name: { ar: "", en: "" }, code: "", currency: "USD", timezone: "Asia/Riyadh", active: true },
  jobTitles: { name: { ar: "", en: "" }, active: true },
};

function ItemEditor({ type, item, onSaved, onClose }) {
  const { t } = useLanguage();
  const [form, setForm] = useState(item || EMPTY[type]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));

  async function save() {
    setSaving(true);
    setError("");
    try {
      const { item: saved } = item
        ? await api(`/api/org/${type}/${item.id}`, { method: "PATCH", body: form })
        : await api(`/api/org/${type}`, { method: "POST", body: form });
      onSaved(saved);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <BilingualField label={t("erp.org.name")} value={form.name} onChange={set("name")} />
      {type !== "jobTitles" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={t("erp.org.code")} value={form.code} onChange={set("code")} dir="ltr" />
          {type === "departments" && (
            <div>
              <label className="mb-2 block text-sm font-medium text-white/70">{t("erp.org.color")}</label>
              <input
                type="color"
                value={form.color}
                onChange={(e) => set("color")(e.target.value)}
                className="h-11 w-full cursor-pointer rounded-xl border border-white/10 bg-white/5 p-1"
              />
            </div>
          )}
          {type === "branches" && (
            <>
              <Input label={t("erp.org.currency")} value={form.currency} onChange={set("currency")} dir="ltr" />
              <Input label={t("erp.org.timezone")} value={form.timezone} onChange={set("timezone")} dir="ltr" />
            </>
          )}
        </div>
      )}
      <Toggle checked={form.active !== false} onChange={set("active")} label={t("erp.org.active")} />

      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button onClick={save} disabled={saving}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

export default function OrgManager({ initialOrg, canManage }) {
  const { t, lang } = useLanguage();
  const [org, setOrg] = useState(initialOrg);
  // Employees without org.manage only get the hierarchy.
  const [tab, setTab] = useState(canManage ? "departments" : "hierarchy");
  const tabs = canManage ? [...TYPES, "hierarchy"] : ["hierarchy"];
  const [editing, setEditing] = useState(null); // item, or "new"
  const [error, setError] = useState("");

  async function remove(item) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    setError("");
    try {
      await api(`/api/org/${tab}/${item.id}`, { method: "DELETE" });
      setOrg((o) => ({ ...o, [tab]: o[tab].filter((i) => i.id !== item.id) }));
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  function saved(item) {
    setOrg((o) => ({
      ...o,
      [tab]: o[tab].some((i) => i.id === item.id) ? o[tab].map((i) => (i.id === item.id ? item : i)) : [...o[tab], item],
    }));
    setEditing(null);
  }

  return (
    <div>
      <PageHeader
        title={t("erp.nav.organization")}
        subtitle={t(canManage ? "erp.org.subtitle" : "erp.org.hierarchySubtitle")}
        actions={
          tab !== "hierarchy" && (
            <Button onClick={() => setEditing("new")}>
              <Plus size={16} />
              {t("common.add")}
            </Button>
          )
        }
      />

      <div className="relative mb-6 flex gap-1 border-b border-white/10">
        {tabs.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              setError("");
            }}
            className="relative px-4 py-3 text-sm font-medium text-white/60 data-[active=true]:text-white"
            data-active={tab === key}
          >
            {t(`erp.org.${key}`)}
            {tab === key && (
              <motion.span layoutId="org-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-orange" />
            )}
          </button>
        ))}
      </div>

      {tab === "hierarchy" ? (
        <OrgChart />
      ) : (
      <>
      <ErrorText>{error}</ErrorText>

      <div className="mt-4 space-y-2">
        {org[tab].map((item) => (
          <div key={item.id} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            {tab === "departments" && <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: item.color }} />}
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {item.name?.[lang]}
                {item.code && <span className="ms-2 text-xs text-white/40">{item.code}</span>}
              </p>
              <p className="text-xs text-white/40">
                {item.name?.[lang === "ar" ? "en" : "ar"]}
                {tab === "branches" && ` · ${item.currency} · ${item.timezone}`}
              </p>
            </div>
            {item.active === false && (
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/50">{t("erp.org.inactive")}</span>
            )}
            <button
              type="button"
              onClick={() => setEditing(item)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
              aria-label={t("common.edit")}
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={() => remove(item)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10"
              aria-label={t("common.delete")}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {org[tab].length === 0 && <p className="py-8 text-center text-white/40">{t("dashboard.noItems")}</p>}
      </div>
      </>
      )}

      <Modal open={Boolean(editing) && tab !== "hierarchy"} onClose={() => setEditing(null)} title={t(`erp.org.${tab}`)}>
        {editing && (
          <ItemEditor type={tab} item={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={saved} />
        )}
      </Modal>
    </div>
  );
}
