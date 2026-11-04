"use client";

import { useMemo, useState } from "react";
import {
  Copy,
  Lock,
  Save,
  Search,
  ShieldAlert,
  Trash2,
  Undo2,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import {
  PERMISSIONS,
  RESTRICTED_PAGES,
  RESTRICTED_PERMISSIONS,
  SCOPES,
} from "@/lib/permissions";
import BilingualField from "@/components/dashboard/BilingualField";
import Avatar from "@/components/erp/ui/Avatar";
import { Button, ErrorText, Toggle } from "@/components/erp/ui/fields";
import {
  Chip,
  GroupBox,
  hintKey,
  isSensitive,
  NavPreview,
  PagePicker,
  PERM_GROUPS,
  Section,
  simulatedUser,
} from "./accessShared";

const blank = {
  name: { ar: "", en: "" },
  description: { ar: "", en: "" },
  permissions: [],
  scope: "self",
  limited: false,
  pages: [],
  crossDepartment: false,
};
const formOf = (r) =>
  r
    ? {
        name: r.name,
        description: r.description || blank.description,
        permissions: r.permissions,
        scope: r.scope,
        limited: r.limited,
        pages: r.pages,
        crossDepartment: Boolean(r.crossDepartment),
      }
    : blank;

// How many things differ between the saved role and the form.
function changeCount(a, b) {
  const sym = (x, y) =>
    x.filter((v) => !y.includes(v)).length +
    y.filter((v) => !x.includes(v)).length;
  return (
    sym(a.permissions, b.permissions) +
    sym(a.pages, b.pages) +
    (a.scope !== b.scope) +
    (a.limited !== b.limited) +
    (a.crossDepartment !== b.crossDepartment) +
    (a.name.ar !== b.name.ar || a.name.en !== b.name.en) +
    (a.description.ar !== b.description.ar ||
      a.description.en !== b.description.en)
  );
}

// One role, edited in place. Remounted (key) when another role is picked.
// `role` null = a new role, `seed` = the form to start from (duplicating).
export default function RoleEditor({
  role,
  seed,
  holders,
  onSaved,
  onDeleted,
  onDuplicate,
  viewer,
}) {
  const { t, lang } = useLanguage();
  const saved = useMemo(() => formOf(role), [role]);
  const [form, setForm] = useState(() => seed || formOf(role));
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState(false);

  const top = Boolean(role?.top);
  const noRole = role?.key === "user";
  const ownRole = role && viewer?.role === role.key && !top;
  const locked = top || noRole || ownRole;
  const changes = role ? changeCount(saved, form) : 1;
  const usable = form.permissions.filter(
    (p) => !form.limited || RESTRICTED_PERMISSIONS.includes(p),
  );
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const q = query.trim().toLowerCase();
  const matches = (p) =>
    !q ||
    p.key.includes(q) ||
    t(`erp.perm.${p.key}`).toLowerCase().includes(q) ||
    t(hintKey(p.key)).toLowerCase().includes(q);

  function togglePerm(key) {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter((p) => p !== key)
        : [...f.permissions, key],
    }));
  }
  function toggleGroup(group) {
    const keys = PERMISSIONS.filter((p) => p.group === group && matches(p)).map(
      (p) => p.key,
    );
    setForm((f) => {
      const all = keys.every((k) => f.permissions.includes(k));
      return {
        ...f,
        permissions: all
          ? f.permissions.filter((p) => !keys.includes(p))
          : [...new Set([...f.permissions, ...keys])],
      };
    });
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const { role: out } = role
        ? await api(`/api/roles/${role.key}`, { method: "PATCH", body: form })
        : await api("/api/roles", { method: "POST", body: form });
      onSaved(
        { ...out, userCount: out.userCount ?? role?.userCount ?? 0 },
        !role,
      );
      // Show what was really stored; say so if the server kept something different.
      const stored = formOf(out);
      if (changeCount(stored, { ...form, permissions: form.limited ? stored.permissions : form.permissions }) > 0) {
        setError(t("erp.access.notStored"));
      }
      setForm(stored);
      setFlash(true);
      setTimeout(() => setFlash(false), 1800);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(t("common.confirmDelete"))) return;
    setError("");
    try {
      await api(`/api/roles/${role.key}`, { method: "DELETE" });
      onDeleted(role.key);
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  const preview = simulatedUser({ ...form, key: role?.key || "new" }, {});

  return (
    <div className="space-y-4">
      {/* Header + save bar */}
      <div className="sticky top-16 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-brand-navy/95 px-4 py-3 backdrop-blur">
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-lg font-semibold">
            {form.name[lang] ||
              form.name.en ||
              form.name.ar ||
              t("erp.access.newRole")}
            {locked && <Lock size={14} className="text-white/40" />}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {role?.system && <Chip>{t("erp.access.system")}</Chip>}
            {form.limited && (
              <Chip tone="red">{t("erp.access.restrictedChip")}</Chip>
            )}
            {form.crossDepartment && !top && (
              <Chip tone="green">{t("erp.access.work.anyChip")}</Chip>
            )}
            <Chip tone="sky">{t(`erp.roles.scope_${form.scope}`)}</Chip>
            <Chip>
              {t("erp.access.permsCount", {
                n: usable.length,
                total: PERMISSIONS.length,
              })}
            </Chip>
            {role && (
              <Chip>{t("erp.access.peopleCount", { n: holders.length })}</Chip>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {flash && (
            <span className="text-xs text-emerald-300">
              {t("erp.access.saved")}
            </span>
          )}
          {role && changes > 0 && !locked && (
            <span className="text-xs text-brand-orange">
              {t("erp.access.unsaved", { n: changes })}
            </span>
          )}
          {role && !top && (
            <Button
              variant="ghost"
              onClick={() =>
                onDuplicate({
                  ...form,
                  name: {
                    ar: t("erp.access.copyOf", { name: form.name.ar }),
                    en: `Copy of ${form.name.en}`,
                  },
                })
              }
            >
              <Copy size={15} />{" "}
              <span className="hidden sm:inline">
                {t("erp.access.duplicate")}
              </span>
            </Button>
          )}
          {role && !role.system && (
            <Button
              variant="danger"
              onClick={remove}
              aria-label={t("erp.access.deleteRole")}
            >
              <Trash2 size={15} />
            </Button>
          )}
          {!locked && role && changes > 0 && (
            <Button variant="ghost" onClick={() => setForm(saved)}>
              <Undo2 size={15} /> {t("erp.access.discard")}
            </Button>
          )}
          {!locked && (
            <Button
              onClick={save}
              loading={busy}
              disabled={busy || (role && changes === 0)}
            >
              <Save size={15} /> {t("common.save")}
            </Button>
          )}
        </div>
      </div>
      <ErrorText>{error}</ErrorText>

      {(top || noRole) && (
        <p className="flex items-start gap-2 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          {t(top ? "erp.access.topLocked" : "erp.access.noRoleLocked")}
        </p>
      )}
      {ownRole && (
        <p className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/60">
          {t("erp.access.person.self")}
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          {!top && (
            <Section title={t("erp.roles.name")}>
              <fieldset
                disabled={locked}
                className="space-y-4 disabled:opacity-60"
              >
                <BilingualField
                  label={t("erp.roles.name")}
                  value={form.name}
                  onChange={set("name")}
                />
                <BilingualField
                  label={t("erp.access.description")}
                  value={form.description}
                  onChange={set("description")}
                />
              </fieldset>
            </Section>
          )}

          {!top && !noRole && (
            <Section title={t("erp.access.account")}>
              <div className={locked ? "pointer-events-none opacity-60" : ""}>
                <Toggle
                  checked={form.limited}
                  onChange={set("limited")}
                  label={t("erp.access.restricted")}
                />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-white/45">
                {t("erp.access.restrictedHint")}
              </p>
            </Section>
          )}

          {!top && !noRole && !form.limited && (
            <Section title={t("erp.access.work.title")}>
              <div className={locked ? "pointer-events-none opacity-60" : ""}>
                <Toggle
                  checked={form.crossDepartment}
                  onChange={set("crossDepartment")}
                  label={t("erp.access.work.roleToggle")}
                />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-white/45">
                {t("erp.access.work.roleHint")}
              </p>
            </Section>
          )}

          <Section title={t("erp.access.scopeTitle")}>
            <div className="grid gap-2 sm:grid-cols-3">
              {SCOPES.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={locked}
                  onClick={() => set("scope")(s)}
                  className={`rounded-xl border p-3 text-start transition ${
                    form.scope === s
                      ? "border-brand-orange bg-brand-orange/10"
                      : "border-white/10 hover:border-white/25"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <p className="text-sm font-medium">
                    {t(`erp.roles.scope_${s}`)}
                  </p>
                  <p className="mt-1 text-[11px] leading-snug text-white/45">
                    {t(`erp.access.scopeHint.${s}`)}
                  </p>
                </button>
              ))}
            </div>
          </Section>

          <Section
            title={`${t("erp.access.permsTitle")} · ${usable.length}/${PERMISSIONS.length}`}
            aside={
              !locked && (
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    className="text-white/50 hover:text-white"
                    onClick={() =>
                      set("permissions")(PERMISSIONS.map((p) => p.key))
                    }
                  >
                    {t("erp.access.selectAll")}
                  </button>
                  <span className="text-white/20">·</span>
                  <button
                    type="button"
                    className="text-white/50 hover:text-white"
                    onClick={() => set("permissions")([])}
                  >
                    {t("erp.access.clearAll")}
                  </button>
                </div>
              )
            }
          >
            <div className="relative mb-3">
              <Search
                size={14}
                className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-white/30"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("erp.access.searchPerms")}
                className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pe-3 ps-9 text-sm outline-none focus:border-white/30"
              />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {PERM_GROUPS.map((group) => {
                const perms = PERMISSIONS.filter(
                  (p) => p.group === group && matches(p),
                );
                if (!perms.length) return null;
                const n = perms.filter((p) => usable.includes(p.key)).length;
                const state =
                  n === 0 ? "none" : n === perms.length ? "all" : "some";
                return (
                  <div
                    key={group}
                    className="rounded-xl border border-white/10 p-3"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <GroupBox
                        state={state}
                        disabled={locked}
                        onClick={() => toggleGroup(group)}
                        label={t(`erp.perm_group.${group}`)}
                      />
                      <p className="flex-1 text-xs font-semibold uppercase tracking-wider text-white/45">
                        {t(`erp.perm_group.${group}`)}
                      </p>
                      <span className="text-[11px] text-white/35">
                        {n}/{perms.length}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {perms.map((p) => {
                        const off =
                          form.limited &&
                          !RESTRICTED_PERMISSIONS.includes(p.key);
                        return (
                          <label
                            key={p.key}
                            title={
                              off ? t("erp.access.restrictedPerm") : undefined
                            }
                            className={`flex items-start gap-3 rounded-lg px-1.5 py-1.5 text-sm ${locked || off ? "text-white/40" : "cursor-pointer text-white/85 hover:bg-white/5"}`}
                          >
                            <input
                              type="checkbox"
                              disabled={locked || off}
                              checked={!off && form.permissions.includes(p.key)}
                              onChange={() => togglePerm(p.key)}
                              className="mt-0.5 h-4 w-4 accent-[#f37b20]"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-1.5">
                                {t(`erp.perm.${p.key}`)}
                                {isSensitive(p.key) && (
                                  <Chip tone="red">
                                    {t("erp.access.sensitive")}
                                  </Chip>
                                )}
                              </span>
                              <span className="mt-0.5 block text-[11px] leading-snug text-white/40">
                                {t(hintKey(p.key))}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          {!top && !noRole && (
            <Section title={t("erp.access.pagesTitle")}>
              <PagePicker
                pages={form.pages}
                onChange={set("pages")}
                restrictedTo={form.limited ? RESTRICTED_PAGES : null}
                disabled={locked}
              />
            </Section>
          )}
        </div>

        <div className="space-y-4">
          <Section title={t("erp.access.previewTitle")}>
            <NavPreview user={preview} hint={t("erp.access.previewHint")} />
          </Section>
          {role && (
            <Section title={`${t("erp.access.holders")} · ${holders.length}`}>
              {holders.length === 0 ? (
                <p className="text-xs text-white/35">
                  {t("erp.access.noHolders")}
                </p>
              ) : (
                <ul className="max-h-80 space-y-2 overflow-y-auto">
                  {holders.map((p) => (
                    <li key={p.id} className="flex items-center gap-2">
                      <Avatar name={p.name} src={p.avatarUrl} size={28} />
                      <span className="min-w-0 flex-1 truncate text-xs text-white/75">
                        {p.name}
                      </span>
                      {(p.access.grant.length > 0 ||
                        p.access.deny.length > 0 ||
                        p.access.scope ||
                        p.access.hiddenPages.length > 0) && (
                        <Chip tone="orange">
                          {t("erp.access.person.hasExceptions")}
                        </Chip>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
