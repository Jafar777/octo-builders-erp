"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Pencil, Search } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useOnlineUsers } from "@/context/RealtimeContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDate } from "@/lib/formatTime";
import Avatar from "@/components/erp/ui/Avatar";
import Modal from "@/components/erp/ui/Modal";
import { Button, ErrorText, Input, PageHeader, Select } from "@/components/erp/ui/fields";

const FILTERS = ["all", "pending", "active", "inactive"];

function StaffEditor({ person, roles, org, meId, onSaved, onClose }) {
  const { t, lang } = useLanguage();
  const [form, setForm] = useState({
    name: person.name,
    role: person.role,
    department: person.department || "",
    branch: person.branch || "",
    jobTitle: person.jobTitle || "",
    status: person.status,
    phone: person.phone,
    badgeId: person.badgeId,
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
      <div className="flex items-center gap-3">
        <Avatar name={person.name || person.email} src={person.avatarUrl} size={48} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{person.name || "—"}</p>
          <p className="truncate text-sm text-white/50" dir="ltr">
            {person.email}
          </p>
        </div>
      </div>

      <Input label={t("auth.name")} value={form.name} onChange={set("name")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label={t("erp.staff.role")}
          value={form.role}
          onChange={set("role")}
          options={roles.map((r) => ({ value: r.key, label: r.name?.[lang] }))}
        />
        <Select
          label={t("erp.staff.status")}
          value={form.status}
          onChange={set("status")}
          options={[
            { value: "active", label: t("erp.staff.active") },
            { value: "inactive", label: t("erp.staff.inactive") },
          ]}
        />
        <Select label={t("erp.org.department")} value={form.department} onChange={set("department")} options={options(org.departments)} placeholder="—" />
        <Select label={t("erp.org.branch")} value={form.branch} onChange={set("branch")} options={options(org.branches)} placeholder="—" />
        <Select label={t("erp.org.jobTitle")} value={form.jobTitle} onChange={set("jobTitle")} options={options(org.jobTitles)} placeholder="—" />
        <Input label={t("erp.staff.phone")} value={form.phone} onChange={set("phone")} dir="ltr" />
        <Input label={t("erp.staff.badgeId")} value={form.badgeId} onChange={set("badgeId")} dir="ltr" />
      </div>
      {isMe && <p className="text-xs text-white/40">{t("erp.staff.selfNote")}</p>}

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

export default function StaffManager({ initialStaff, roles, org, canManage, meId }) {
  const { t, lang } = useLanguage();
  const searchParams = useSearchParams();
  const online = useOnlineUsers();
  const [staff, setStaff] = useState(initialStaff);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(FILTERS.includes(searchParams.get("filter")) ? searchParams.get("filter") : "all");
  const [editing, setEditing] = useState(null);

  const nameOf = (list, id) => list.find((i) => i.id === id)?.name?.[lang] || "—";
  const roleName = (key) => roles.find((r) => r.key === key)?.name?.[lang] || key;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return staff.filter((p) => {
      if (filter === "pending" && p.role !== "user") return false;
      if (filter === "active" && (p.status !== "active" || p.role === "user")) return false;
      if (filter === "inactive" && p.status !== "inactive") return false;
      return !q || p.name.toLowerCase().includes(q) || p.email.includes(q);
    });
  }, [staff, query, filter]);

  const pendingCount = staff.filter((p) => p.role === "user").length;

  return (
    <div>
      <PageHeader title={t("erp.nav.staff")} subtitle={t("erp.staff.subtitle")} />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("erp.search")}
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pe-3 ps-9 text-sm outline-none focus:border-white/30"
          />
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 p-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-sm ${filter === f ? "bg-brand-orange text-white" : "text-white/60 hover:text-white"}`}
            >
              {t(`erp.staff.filter_${f}`)}
              {f === "pending" && pendingCount > 0 && ` (${pendingCount})`}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-white/[0.04] text-xs uppercase tracking-wider text-white/45">
            <tr>
              <th className="px-4 py-3 text-start font-medium">{t("auth.name")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("erp.staff.role")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("erp.org.department")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("erp.org.branch")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("erp.staff.joined")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={p.name || p.email} src={p.avatarUrl} size={36} online={online.size ? online.has(p.id) : undefined} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.name || "—"}</p>
                      <p className="truncate text-xs text-white/45" dir="ltr">
                        {p.email}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs ${
                      p.role === "user" ? "bg-brand-orange/15 text-brand-orange" : "bg-white/10 text-white/80"
                    }`}
                  >
                    {p.role === "user" ? t("erp.staff.pending") : roleName(p.role)}
                  </span>
                  {p.status === "inactive" && (
                    <span className="ms-2 rounded-full bg-red-500/15 px-2.5 py-1 text-xs text-red-400">{t("erp.staff.inactive")}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-white/70">{nameOf(org.departments, p.department)}</td>
                <td className="px-4 py-3 text-white/70">{nameOf(org.branches, p.branch)}</td>
                <td className="px-4 py-3 text-white/50">{formatDate(p.createdAt, lang)}</td>
                <td className="px-4 py-3 text-end">
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => setEditing(p)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                      aria-label={t("common.edit")}
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-white/40">
                  {t("dashboard.noItems")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={t("erp.staff.edit")}>
        {editing && (
          <StaffEditor
            person={editing}
            roles={roles}
            org={org}
            meId={meId}
            onClose={() => setEditing(null)}
            onSaved={(saved) => {
              setStaff((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
              setEditing(null);
            }}
          />
        )}
      </Modal>
    </div>
  );
}
