"use client";

import { useState } from "react";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { PERMISSIONS, SCOPES } from "@/lib/permissions";
import BilingualField from "@/components/dashboard/BilingualField";
import Modal from "@/components/erp/ui/Modal";
import { Button, Card, ErrorText, PageHeader, Select } from "@/components/erp/ui/fields";

const GROUPS = [...new Set(PERMISSIONS.map((p) => p.group))];

function RoleEditor({ role, onSaved, onClose }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({
    name: role?.name || { ar: "", en: "" },
    permissions: role?.permissions || [],
    scope: role?.scope || "self",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const locked = role?.key === "gm" || role?.key === "user";

  function toggle(key) {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key) ? f.permissions.filter((p) => p !== key) : [...f.permissions, key],
    }));
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const { role: saved } = role
        ? await api(`/api/roles/${role.key}`, { method: "PATCH", body: form })
        : await api("/api/roles", { method: "POST", body: form });
      onSaved({ ...saved, userCount: role?.userCount || 0 });
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <BilingualField label={t("erp.roles.name")} value={form.name} onChange={(name) => setForm((f) => ({ ...f, name }))} />

      <Select
        label={t("erp.roles.scope")}
        value={form.scope}
        onChange={(scope) => setForm((f) => ({ ...f, scope }))}
        options={SCOPES.map((s) => ({ value: s, label: t(`erp.roles.scope_${s}`) }))}
      />

      <div>
        <p className="mb-2 text-sm font-medium text-white/70">{t("erp.roles.permissions")}</p>
        {locked && <p className="mb-3 text-xs text-white/40">{t("erp.roles.lockedNote")}</p>}
        <div className="space-y-4">
          {GROUPS.map((group) => (
            <div key={group} className="rounded-xl border border-white/10 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">{t(`erp.perm_group.${group}`)}</p>
              <div className="space-y-2">
                {PERMISSIONS.filter((p) => p.group === group).map((p) => (
                  <label key={p.key} className="flex cursor-pointer items-start gap-3 text-sm text-white/80">
                    <input
                      type="checkbox"
                      disabled={locked}
                      checked={form.permissions.includes(p.key)}
                      onChange={() => toggle(p.key)}
                      className="mt-0.5 h-4 w-4 accent-[#f37b20]"
                    />
                    <span>
                      {t(`erp.perm.${p.key}`)}
                      <span className="block text-xs text-white/35" dir="ltr">
                        {p.key}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

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

export default function RolesManager({ initialRoles }) {
  const { t, lang } = useLanguage();
  const [roles, setRoles] = useState(initialRoles);
  const [editing, setEditing] = useState(null); // role object, or "new"
  const [error, setError] = useState("");

  async function remove(role) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    setError("");
    try {
      await api(`/api/roles/${role.key}`, { method: "DELETE" });
      setRoles((prev) => prev.filter((r) => r.key !== role.key));
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  return (
    <div>
      <PageHeader
        title={t("erp.nav.roles")}
        subtitle={t("erp.roles.subtitle")}
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus size={16} />
            {t("erp.roles.add")}
          </Button>
        }
      />
      <ErrorText>{error}</ErrorText>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {roles.map((role) => (
          <Card key={role.key}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 font-semibold">
                  {role.name?.[lang]}
                  {role.system && <Lock size={13} className="text-white/35" />}
                </p>
                <p className="mt-1 text-xs text-white/45">
                  {t(`erp.roles.scope_${role.scope}`)} · {role.userCount} {t("erp.roles.people")}
                </p>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditing(role)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                  aria-label={t("common.edit")}
                >
                  <Pencil size={14} />
                </button>
                {!role.system && (
                  <button
                    type="button"
                    onClick={() => remove(role)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10"
                    aria-label={t("common.delete")}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {role.permissions.length === 0 && <span className="text-xs text-white/35">{t("erp.roles.noPermissions")}</span>}
              {role.permissions.map((p) => (
                <span key={p} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white/70">
                  {t(`erp.perm.${p}`)}
                </span>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === "new" ? t("erp.roles.add") : t("erp.roles.edit")}
        wide
      >
        {editing && (
          <RoleEditor
            role={editing === "new" ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={(saved) => {
              setRoles((prev) =>
                prev.some((r) => r.key === saved.key) ? prev.map((r) => (r.key === saved.key ? saved : r)) : [...prev, saved]
              );
              setEditing(null);
            }}
          />
        )}
      </Modal>
    </div>
  );
}
