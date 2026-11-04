"use client";

import { useMemo, useState } from "react";
import { Ban, Check, Eraser, Save, Search, ShieldAlert, Undo2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { effectiveAccess, PAGES, PERMISSIONS, SCOPES } from "@/lib/permissions";
import Avatar from "@/components/erp/ui/Avatar";
import { Button, ErrorText, Select } from "@/components/erp/ui/fields";
import { Chip, hintKey, isSensitive, NavPreview, PERM_GROUPS, sameSet, Section, simulatedUser } from "./accessShared";

const EMPTY = { grant: [], deny: [], scope: null, hiddenPages: [], workDepartments: [], crossDepartment: null, note: "" };
export const hasExceptions = (a) =>
  Boolean(a && (a.grant.length || a.deny.length || a.scope || a.hiddenPages.length || a.workDepartments?.length || typeof a.crossDepartment === "boolean"));

// The People tab: pick anyone, see exactly what they can do and where it comes from,
// change their role, and give them exceptions to it.
export default function PeopleAccess({ people, roles, departments, viewer, onPersonChanged }) {
  const { t, lang } = useLanguage();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [onlyExceptions, setOnlyExceptions] = useState(false);
  const [selected, setSelected] = useState(null);
  const roleOf = useMemo(() => Object.fromEntries(roles.map((r) => [r.key, r])), [roles]);

  const q = query.trim().toLowerCase();
  const list = people.filter(
    (p) =>
      (!q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)) &&
      (!roleFilter || p.role === roleFilter) &&
      (!deptFilter || p.departments.includes(deptFilter)) &&
      (!onlyExceptions || hasExceptions(p.access))
  );
  const person = people.find((p) => p.id === selected) || null;

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("erp.access.search")}
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pe-3 ps-9 text-sm outline-none focus:border-white/30"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={roleFilter} onChange={setRoleFilter} placeholder={t("erp.access.person.filterRole")} options={roles.map((r) => ({ value: r.key, label: r.name?.[lang] || r.key }))} />
          <Select value={deptFilter} onChange={setDeptFilter} placeholder={t("erp.access.person.filterDept")} options={departments.map((d) => ({ value: d.id, label: d.name?.[lang] || "" }))} />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-white/60">
          <input type="checkbox" className="accent-[#f37b20]" checked={onlyExceptions} onChange={(e) => setOnlyExceptions(e.target.checked)} />
          {t("erp.access.person.onlyChanged")}
        </label>
        <ul className="max-h-[65vh] space-y-1 overflow-y-auto rounded-2xl border border-white/10 p-1.5">
          {list.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setSelected(p.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-start transition ${selected === p.id ? "bg-brand-orange/15" : "hover:bg-white/5"}`}
              >
                <Avatar name={p.name} src={p.avatarUrl} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{p.name}</span>
                  <span className="block truncate text-[11px] text-white/40">{roleOf[p.role]?.name?.[lang] || p.role}</span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  {hasExceptions(p.access) && <Chip tone="orange">{t("erp.access.person.hasExceptions")}</Chip>}
                  {p.status === "inactive" && <Chip>{t("erp.access.person.inactive")}</Chip>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {person ? (
        <PersonPanel key={person.id} person={person} role={roleOf[person.role]} roles={roles} departments={departments} viewer={viewer} onChanged={onPersonChanged} />
      ) : (
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-white/10 p-6 text-sm text-white/40">{t("erp.access.person.pick")}</div>
      )}
    </div>
  );
}

function PersonPanel({ person, role, roles, departments, viewer, onChanged }) {
  const { t, lang } = useLanguage();
  const [form, setForm] = useState({ ...EMPTY, ...person.access });
  const [roleKey, setRoleKey] = useState(person.role);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState(false);

  const self = person.id === viewer?.id;
  const top = Boolean(role?.top);
  const locked = self || top;
  const pickedRole = roles.find((r) => r.key === roleKey) || role;
  const eff = effectiveAccess(pickedRole, form, roleKey);
  const fromRole = new Set(pickedRole?.permissions || []);
  const roleChanged = roleKey !== person.role;
  const accessChanged =
    !sameSet(form.grant, person.access.grant) ||
    !sameSet(form.deny, person.access.deny) ||
    !sameSet(form.hiddenPages, person.access.hiddenPages) ||
    (form.scope || null) !== (person.access.scope || null) ||
    !sameSet(form.workDepartments, person.access.workDepartments || []) ||
    form.crossDepartment !== (person.access.crossDepartment ?? null) ||
    form.note !== person.access.note;
  const changes = Number(roleChanged) + Number(accessChanged);
  const anyDepartment = form.crossDepartment === true || (form.crossDepartment === null && Boolean(pickedRole?.crossDepartment));

  // Each permission: "inherit" (whatever the role says), "allow" or "deny".
  const stateOf = (k) => (form.grant.includes(k) ? "allow" : form.deny.includes(k) ? "deny" : "inherit");
  function setState(k, s) {
    setForm((f) => ({
      ...f,
      grant: s === "allow" ? [...new Set([...f.grant, k])] : f.grant.filter((p) => p !== k),
      deny: s === "deny" ? [...new Set([...f.deny, k])] : f.deny.filter((p) => p !== k),
    }));
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      if (roleChanged) await api(`/api/staff/${person.id}`, { method: "PATCH", body: { role: roleKey } });
      if (accessChanged) await api(`/api/access/${person.id}`, { method: "PATCH", body: form });
      onChanged({ ...person, role: roleKey, access: { ...EMPTY, ...form, scope: form.scope || null } });
      setFlash(true);
      setTimeout(() => setFlash(false), 1800);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  const preview = simulatedUser(pickedRole, form, { trainee: person.trainee, role: roleKey });
  const segBtn = (k, s, Icon, label, tone) => {
    const on = stateOf(k) === s;
    return (
      <button
        type="button"
        disabled={locked}
        onClick={() => setState(k, s)}
        title={label}
        className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition ${on ? tone : "text-white/45 hover:text-white"} disabled:cursor-not-allowed`}
      >
        {Icon && <Icon size={12} />}
        {label}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="sticky top-16 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-brand-navy/95 px-4 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={person.name} src={person.avatarUrl} size={44} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{person.name}</p>
            <p className="truncate text-xs text-white/40" dir="ltr">
              {person.email}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Chip tone="sky">{t(`erp.roles.scope_${eff.scope}`)}</Chip>
              <Chip>{t("erp.access.permsCount", { n: eff.permissions.length, total: PERMISSIONS.length })}</Chip>
              {eff.limited && <Chip tone="red">{t("erp.access.restrictedChip")}</Chip>}
              {person.trainee && <Chip tone="green">{t("erp.access.person.trainee")}</Chip>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {flash && <span className="text-xs text-emerald-300">{t("erp.access.saved")}</span>}
          {changes > 0 && <span className="text-xs text-brand-orange">{t("erp.access.unsaved", { n: changes })}</span>}
          {!locked && hasExceptions(form) && (
            <Button variant="ghost" onClick={() => setForm({ ...EMPTY, note: form.note })}>
              <Eraser size={15} /> <span className="hidden sm:inline">{t("erp.access.person.reset")}</span>
            </Button>
          )}
          {changes > 0 && (
            <Button
              variant="ghost"
              onClick={() => {
                setForm({ ...EMPTY, ...person.access });
                setRoleKey(person.role);
              }}
            >
              <Undo2 size={15} /> {t("erp.access.discard")}
            </Button>
          )}
          {!locked && (
            <Button onClick={save} loading={busy} disabled={busy || changes === 0}>
              <Save size={15} /> {t("common.save")}
            </Button>
          )}
        </div>
      </div>
      <ErrorText>{error}</ErrorText>
      {(self || top) && (
        <p className="flex items-start gap-2 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          {t(self ? "erp.access.person.self" : "erp.access.person.topPerson")}
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <Section title={t("erp.access.person.role")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                value={roleKey}
                disabled={self}
                onChange={setRoleKey}
                options={roles.filter((r) => r.key !== "user" || person.role === "user").map((r) => ({ value: r.key, label: r.name?.[lang] || r.key }))}
              />
              <Select
                value={form.scope || ""}
                disabled={locked}
                onChange={(v) => setForm((f) => ({ ...f, scope: v || null }))}
                placeholder={t("erp.access.person.scopeInherit", { scope: t(`erp.roles.scope_${pickedRole?.scope || "self"}`) })}
                options={SCOPES.map((s) => ({ value: s, label: t(`erp.roles.scope_${s}`) }))}
              />
            </div>
            <p className="mt-2 text-xs text-white/40">{t("erp.access.person.roleHint")}</p>
          </Section>

          {!top && (
            <Section
              title={t("erp.access.person.exceptions")}
              aside={
                <label className="flex cursor-pointer items-center gap-2 text-xs text-white/55">
                  <input type="checkbox" className="accent-[#f37b20]" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} />
                  {t("erp.access.person.onlyChanged")}
                </label>
              }
            >
              <p className="mb-3 text-xs text-white/40">{t("erp.access.person.exceptionsHint")}</p>
              <div className="space-y-3">
                {PERM_GROUPS.map((group) => {
                  const perms = PERMISSIONS.filter((p) => p.group === group && (!onlyChanged || stateOf(p.key) !== "inherit"));
                  if (!perms.length) return null;
                  return (
                    <div key={group} className="rounded-xl border border-white/10">
                      <p className="border-b border-white/5 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">{t(`erp.perm_group.${group}`)}</p>
                      <ul className="divide-y divide-white/5">
                        {perms.map((p) => {
                          const has = eff.permissions.includes(p.key);
                          return (
                            <li key={p.key} className="flex flex-wrap items-center gap-3 px-3 py-2">
                              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${has ? "bg-emerald-500/20 text-emerald-300" : "bg-white/5 text-white/25"}`}>
                                {has ? <Check size={12} strokeWidth={3} /> : <Ban size={11} />}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-1.5 text-sm text-white/85">
                                  {t(`erp.perm.${p.key}`)}
                                  {isSensitive(p.key) && <Chip tone="red">{t("erp.access.sensitive")}</Chip>}
                                  <span className="text-[10px] text-white/35">{fromRole.has(p.key) ? t("erp.access.person.fromRole") : t("erp.access.person.notInRole")}</span>
                                </span>
                                <span className="block text-[11px] leading-snug text-white/40">{t(hintKey(p.key))}</span>
                              </span>
                              <span className="flex rounded-lg border border-white/10 p-0.5">
                                {segBtn(p.key, "inherit", null, t("erp.access.person.inherit"), "bg-white/10 text-white")}
                                {segBtn(p.key, "allow", Check, t("erp.access.person.allow"), "bg-emerald-500/20 text-emerald-200")}
                                {segBtn(p.key, "deny", Ban, t("erp.access.person.deny"), "bg-red-500/20 text-red-200")}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {!top && !eff.limited && (
            <Section title={t("erp.access.work.title")}>
              <div className="max-w-sm">
                <Select
                  value={form.crossDepartment === null ? "" : String(form.crossDepartment)}
                  disabled={locked}
                  onChange={(v) => setForm((f) => ({ ...f, crossDepartment: v === "" ? null : v === "true" }))}
                  placeholder={t("erp.access.work.inherit", { value: t(pickedRole?.crossDepartment ? "erp.access.work.yes" : "erp.access.work.no") })}
                  options={[
                    { value: "true", label: t("erp.access.work.anyYes") },
                    { value: "false", label: t("erp.access.work.anyNo") },
                  ]}
                />
              </div>
              {anyDepartment ? (
                <p className="mt-3 text-xs text-emerald-300/80">{t("erp.access.work.anyOn")}</p>
              ) : (
                <>
                  <p className="mb-2 mt-3 text-xs text-white/45">{t("erp.access.work.pick")}</p>
                  <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                    {departments.map((d) => {
                      const own = person.departments.includes(d.id);
                      return (
                        <label
                          key={d.id}
                          className={`flex items-center gap-2 rounded-lg border border-white/5 px-2.5 py-2 text-xs ${own || locked ? "text-white/45" : "cursor-pointer text-white/80 hover:bg-white/5"}`}
                        >
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-[#f37b20]"
                            disabled={own || locked}
                            checked={own || form.workDepartments.includes(d.id)}
                            onChange={() =>
                              setForm((f) => ({
                                ...f,
                                workDepartments: f.workDepartments.includes(d.id) ? f.workDepartments.filter((x) => x !== d.id) : [...f.workDepartments, d.id],
                              }))
                            }
                          />
                          <span className="h-2 w-2 rounded-full" style={{ background: d.color || "#94a3b8" }} />
                          <span className="flex-1">{d.name?.[lang]}</span>
                          {own && <span className="text-[10px] text-white/30">{t("erp.access.work.own")}</span>}
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
              <p className="mt-3 text-xs leading-relaxed text-white/40">{t("erp.access.work.personHint")}</p>
            </Section>
          )}

          {!top && (
            <Section title={t("erp.access.person.hiddenPages")}>
              <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                {PAGES.filter((p) => !["overview", "profile", "notifications"].includes(p.key)).map((p) => (
                  <label key={p.key} className={`flex items-center gap-2 rounded-lg border border-white/5 px-2.5 py-2 text-xs ${locked ? "text-white/45" : "cursor-pointer text-white/80 hover:bg-white/5"}`}>
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-red-500"
                      disabled={locked}
                      checked={form.hiddenPages.includes(p.key)}
                      onChange={() =>
                        setForm((f) => ({
                          ...f,
                          hiddenPages: f.hiddenPages.includes(p.key) ? f.hiddenPages.filter((x) => x !== p.key) : [...f.hiddenPages, p.key],
                        }))
                      }
                    />
                    {t(`erp.nav.${p.key}`)}
                  </label>
                ))}
              </div>
            </Section>
          )}

          {!top && (
            <Section title={t("erp.access.person.note")}>
              <textarea
                rows={2}
                disabled={locked}
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/30 disabled:opacity-60"
              />
            </Section>
          )}
        </div>

        <div className="space-y-4">
          <Section title={t("erp.access.previewTitle")}>
            <NavPreview user={preview} hint={t("erp.access.previewPerson")} />
          </Section>
        </div>
      </div>
    </div>
  );
}
