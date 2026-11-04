"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import Avatar from "@/components/erp/ui/Avatar";
import { Button, ErrorText, Input, Select, Toggle } from "@/components/erp/ui/fields";
import TraineeBadge from "@/components/erp/ui/TraineeBadge";
import NameFields, { initialNames, namesComplete } from "@/components/erp/staff/NameFields";

// Role, department, branch, job title and account status of one person (users.manage).
// `header` shows the person's avatar and email above the form (used in the modal).
export default function StaffEditor({ person, roles, org, meId, onSaved, onClose, header = true }) {
  const { t, lang } = useLanguage();
  const { user: viewer } = useAuth();
  const router = useRouter();
  // Only the CEO decides who is a trainee (lib/training.js).
  const canSetTrainee = Boolean(viewer?.permissions?.includes("training.manage"));
  const [names, setNames] = useState(() => initialNames(person));
  const [form, setForm] = useState({
    role: person.role,
    department: person.department || "",
    branch: person.branch || "",
    jobTitle: person.jobTitle || "",
    status: person.status,
    phone: person.phone,
    trainee: Boolean(person.trainee),
    managedDepartments: person.managedDepartments || [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));
  const options = (items) => items.filter((i) => i.active !== false).map((i) => ({ value: i.id, label: i.name?.[lang] }));
  const isMe = person.id === meId;
  // Department managers: a role limited to one department that reviews its tasks.
  const roleDef = roles.find((r) => r.key === form.role);
  const headsDepartment = roleDef?.scope === "department" && (roleDef.permissions || []).includes("tasks.review");

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
      if (!canSetTrainee || body.trainee === Boolean(person.trainee)) delete body.trainee;
      // Only department managers head other departments.
      if (!headsDepartment) body.managedDepartments = [];
      const { staff } = await api(`/api/staff/${person.id}`, { method: "PATCH", body });
      onSaved(staff);
      // The trainee badges come from the dashboard layout.
      if ("trainee" in body) router.refresh();
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
            <p className="flex items-center gap-2 truncate font-semibold">
              <span className="truncate">{person.name || "—"}</span>
              <TraineeBadge id={person.id} />
            </p>
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
      {/* A department manager can head other departments too (shown in the organization). */}
      {headsDepartment && (
        <div>
          <p className="mb-2 text-sm font-medium text-white/70">{t("erp.staff.managedDepartments")}</p>
          <div className="flex flex-wrap gap-1.5">
            {org.departments
              .filter((d) => d.active !== false && d.id !== form.department)
              .map((d) => {
                const on = form.managedDepartments.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => set("managedDepartments")(on ? form.managedDepartments.filter((x) => x !== d.id) : [...form.managedDepartments, d.id])}
                    className={`rounded-full border px-3 py-1 text-xs ${on ? "border-brand-orange bg-brand-orange/20 text-white" : "border-white/10 text-white/60 hover:text-white"}`}
                  >
                    {on ? "✓ " : "+ "}
                    {d.name?.[lang]}
                  </button>
                );
              })}
          </div>
          <p className="mt-1.5 text-[11px] text-white/60">{t("erp.staff.managedDepartmentsHint")}</p>
        </div>
      )}
      {canSetTrainee && <Toggle checked={form.trainee} onChange={set("trainee")} label={t("erp.staff.trainee")} />}
      {isMe && <p className="text-xs text-white/60">{t("erp.staff.selfNote")}</p>}

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
