"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import Avatar from "@/components/erp/ui/Avatar";
import { Button, ErrorText, Input, Select } from "@/components/erp/ui/fields";
import NameFields, { initialNames, namesComplete } from "@/components/erp/staff/NameFields";

// Role, department, branch, job title and account status of one person (users.manage).
// `header` shows the person's avatar and email above the form (used in the modal).
export default function StaffEditor({ person, roles, org, meId, onSaved, onClose, header = true }) {
  const { t, lang } = useLanguage();
  const [names, setNames] = useState(() => initialNames(person));
  const [form, setForm] = useState({
    role: person.role,
    department: person.department || "",
    branch: person.branch || "",
    jobTitle: person.jobTitle || "",
    status: person.status,
    phone: person.phone,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));
  const options = (items) => items.filter((i) => i.active !== false).map((i) => ({ value: i.id, label: i.name?.[lang] }));
  const isMe = person.id === meId;

  async function save() {
    setSaving(true);
    setError("");
    try {
      const body = { ...form };
      // Names are only sent when changed, so older accounts without them can still be edited.
      if (JSON.stringify(names) !== JSON.stringify(initialNames(person))) Object.assign(body, names);
      if (isMe) {
        delete body.role;
        delete body.status;
      }
      const { staff } = await api(`/api/staff/${person.id}`, { method: "PATCH", body });
      onSaved(staff);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {header && (
        <div className="flex items-center gap-3">
          <Avatar name={person.name || person.email} src={person.avatarUrl} size={48} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{person.name || "—"}</p>
            <p className="truncate text-sm text-white/50" dir="ltr">
              {person.email}
            </p>
          </div>
        </div>
      )}

      <NameFields value={names} onChange={setNames} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label={t("erp.staff.role")}
          value={form.role}
          onChange={set("role")}
          disabled={isMe}
          options={roles.map((r) => ({ value: r.key, label: r.name?.[lang] }))}
        />
        <Select
          label={t("erp.staff.status")}
          value={form.status}
          onChange={set("status")}
          disabled={isMe}
          options={[
            { value: "active", label: t("erp.staff.active") },
            { value: "inactive", label: t("erp.staff.inactive") },
          ]}
        />
        <Select label={t("erp.org.department")} value={form.department} onChange={set("department")} options={options(org.departments)} placeholder="—" />
        <Select label={t("erp.org.branch")} value={form.branch} onChange={set("branch")} options={options(org.branches)} placeholder="—" />
        <Select label={t("erp.org.jobTitle")} value={form.jobTitle} onChange={set("jobTitle")} options={options(org.jobTitles)} placeholder="—" />
        <Input label={t("erp.staff.phone")} value={form.phone} onChange={set("phone")} dir="ltr" />
      </div>
      {isMe && <p className="text-xs text-white/40">{t("erp.staff.selfNote")}</p>}

      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button onClick={save} loading={saving} disabled={!namesComplete(names) && JSON.stringify(names) !== JSON.stringify(initialNames(person))}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}
