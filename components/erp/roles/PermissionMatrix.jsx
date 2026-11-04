"use client";

import { useState } from "react";
import { Check, Lock, Save, Undo2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import {
  ALWAYS_PAGES,
  PAGES,
  PERMISSIONS,
  RESTRICTED_PAGES,
  RESTRICTED_PERMISSIONS,
  SCOPES,
} from "@/lib/permissions";
import { Button, ErrorText } from "@/components/erp/ui/fields";
import {
  Chip,
  hintKey,
  isSensitive,
  PERM_GROUPS,
  sameSet,
} from "./accessShared";

// Every role side by side: rows are permissions (and pages), columns are roles. Clicks
// are staged and saved together, one request per changed role.
export default function PermissionMatrix({ roles, viewer, onSaved }) {
  const { t, lang } = useLanguage();
  const [draft, setDraft] = useState({}); // roleKey -> edited role fields
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const cur = (r) => ({ ...r, ...draft[r.key] });
  const lockedRole = (r) => r.top || r.key === "user" || r.key === viewer?.role;
  const patch = (r, fields) =>
    setDraft((d) => ({ ...d, [r.key]: { ...cur(r), ...fields } }));
  const differs = (r) => {
    const c = cur(r);
    return (
      c.scope !== r.scope ||
      c.limited !== r.limited ||
      c.crossDepartment !== r.crossDepartment ||
      !sameSet(c.permissions, r.permissions) ||
      !sameSet(c.pages, r.pages)
    );
  };
  const dirty = roles.filter((r) => draft[r.key] && differs(r));

  function togglePerm(r, key) {
    const c = cur(r);
    patch(r, {
      permissions: c.permissions.includes(key)
        ? c.permissions.filter((p) => p !== key)
        : [...c.permissions, key],
    });
  }
  // A page is on when the role has no page list (all) or lists it; restricted roles only
  // ever have RESTRICTED_PAGES.
  const pageOn = (c, key) => {
    if (ALWAYS_PAGES.includes(key)) return true;
    if (c.limited)
      return (
        RESTRICTED_PAGES.includes(key) &&
        (!c.pages.length || c.pages.includes(key))
      );
    return !c.pages.length || c.pages.includes(key);
  };
  function togglePage(r, key) {
    const c = cur(r);
    if (
      ALWAYS_PAGES.includes(key) ||
      (c.limited && !RESTRICTED_PAGES.includes(key))
    )
      return;
    const base = c.pages.length
      ? c.pages
      : c.limited
        ? RESTRICTED_PAGES
        : PAGES.map((p) => p.key);
    const next = base.includes(key)
      ? base.filter((p) => p !== key)
      : [...base, key];
    patch(r, {
      pages:
        !c.limited &&
        PAGES.every((p) => next.includes(p.key) || ALWAYS_PAGES.includes(p.key))
          ? []
          : next,
    });
  }

  async function saveAll() {
    setBusy(true);
    setError("");
    try {
      for (const r of dirty) {
        const c = cur(r);
        const { role } = await api(`/api/roles/${r.key}`, {
          method: "PATCH",
          body: {
            name: c.name,
            description: c.description,
            permissions: c.permissions,
            scope: c.scope,
            limited: c.limited,
            pages: c.pages,
            crossDepartment: c.crossDepartment,
          },
        });
        onSaved({ ...role, userCount: r.userCount });
        setDraft((d) => {
          const { [r.key]: _, ...rest } = d;
          return rest;
        });
      }
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  const cell = (on, changed, locked, onClick, label) => (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      aria-label={label}
      aria-pressed={on}
      className={`mx-auto flex h-6 w-6 items-center justify-center rounded-md border transition ${
        on
          ? "border-brand-orange bg-brand-orange text-white"
          : "border-white/15 hover:border-white/40"
      } ${changed ? "ring-2 ring-sky-400/70 ring-offset-1 ring-offset-brand-navy" : ""} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {on && <Check size={13} strokeWidth={3} />}
    </button>
  );

  const head = "sticky start-0 z-[1] bg-brand-navy px-3 py-2 text-start";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-white/45">{t("erp.access.matrixHint")}</p>
        <div className="flex gap-2">
          {dirty.length > 0 && (
            <Button variant="ghost" onClick={() => setDraft({})}>
              <Undo2 size={15} /> {t("erp.access.discard")}
            </Button>
          )}
          <Button onClick={saveAll} loading={busy} disabled={!dirty.length}>
            <Save size={15} /> {t("erp.access.saveAll", { n: dirty.length })}
          </Button>
        </div>
      </div>
      <ErrorText>{error}</ErrorText>

      <div className="max-h-[70vh] overflow-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-max border-collapse text-xs">
          <thead className="sticky top-0 z-[2] bg-brand-navy">
            <tr className="border-b border-white/10">
              <th className={`${head} min-w-64 text-white/45`}>
                {t("erp.access.permsTitle")}
              </th>
              {roles.map((r) => (
                <th
                  key={r.key}
                  className="min-w-24 px-2 py-2 text-center font-semibold"
                >
                  <span className="flex items-center justify-center gap-1">
                    {r.name?.[lang] || r.key}
                    {lockedRole(r) && (
                      <Lock size={11} className="text-white/35" />
                    )}
                  </span>
                  <span className="block text-[10px] font-normal text-white/35">
                    {t("erp.access.peopleCount", { n: r.userCount })}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-white/10 bg-white/[0.02]">
              <td className={head}>{t("erp.access.matrixScope")}</td>
              {roles.map((r) => (
                <td key={r.key} className="px-2 py-1.5 text-center">
                  <select
                    value={cur(r).scope}
                    disabled={lockedRole(r)}
                    onChange={(e) => patch(r, { scope: e.target.value })}
                    className={`rounded-md border bg-transparent px-1.5 py-1 text-[11px] outline-none [&>option]:bg-brand-navy ${
                      cur(r).scope !== r.scope
                        ? "border-sky-400"
                        : "border-white/15"
                    } disabled:opacity-50`}
                  >
                    {SCOPES.map((s) => (
                      <option key={s} value={s}>
                        {t(`erp.roles.scope_${s}`)}
                      </option>
                    ))}
                  </select>
                </td>
              ))}
            </tr>
            <tr className="border-b border-white/10 bg-white/[0.02]">
              <td className={head}>{t("erp.access.matrixRestricted")}</td>
              {roles.map((r) => (
                <td key={r.key} className="px-2 py-1.5 text-center">
                  {cell(
                    cur(r).limited,
                    cur(r).limited !== r.limited,
                    lockedRole(r),
                    () => patch(r, { limited: !cur(r).limited, pages: [] }),
                    t("erp.access.matrixRestricted"),
                  )}
                </td>
              ))}
            </tr>

            <tr className="border-b border-white/10 bg-white/[0.02]">
              <td className={head} title={t("erp.access.work.roleHint")}>
                {t("erp.access.work.matrix")}
              </td>
              {roles.map((r) => (
                <td key={r.key} className="px-2 py-1.5 text-center">
                  {cell(
                    r.top || Boolean(cur(r).crossDepartment),
                    Boolean(cur(r).crossDepartment) !==
                      Boolean(r.crossDepartment),
                    lockedRole(r) || cur(r).limited,
                    () =>
                      patch(r, { crossDepartment: !cur(r).crossDepartment }),
                    t("erp.access.work.matrix"),
                  )}
                </td>
              ))}
            </tr>

            {PERM_GROUPS.map((group) => (
              <PermGroupRows
                key={group}
                group={group}
                roles={roles}
                cur={cur}
                lockedRole={lockedRole}
                cell={cell}
                togglePerm={togglePerm}
                head={head}
              />
            ))}

            <tr className="border-y border-white/10 bg-white/[0.04]">
              <td
                colSpan={roles.length + 1}
                className="sticky start-0 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/40"
              >
                {t("erp.access.matrixPages")}
              </td>
            </tr>
            {PAGES.map((p) => (
              <tr
                key={p.key}
                className="border-b border-white/5 hover:bg-white/[0.03]"
              >
                <td className={`${head} text-white/75`}>
                  {t(`erp.nav.${p.key}`)}
                </td>
                {roles.map((r) => {
                  const c = cur(r);
                  const fixed =
                    ALWAYS_PAGES.includes(p.key) ||
                    (c.limited && !RESTRICTED_PAGES.includes(p.key));
                  return (
                    <td key={r.key} className="px-2 py-1 text-center">
                      {cell(
                        pageOn(c, p.key),
                        pageOn(c, p.key) !== pageOn(r, p.key),
                        lockedRole(r) || fixed,
                        () => togglePage(r, p.key),
                        t(`erp.nav.${p.key}`),
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PermGroupRows({
  group,
  roles,
  cur,
  lockedRole,
  cell,
  togglePerm,
  head,
}) {
  const { t } = useLanguage();
  return (
    <>
      <tr className="border-y border-white/10 bg-white/[0.04]">
        <td
          colSpan={roles.length + 1}
          className="sticky start-0 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/40"
        >
          {t(`erp.perm_group.${group}`)}
        </td>
      </tr>
      {PERMISSIONS.filter((p) => p.group === group).map((p) => (
        <tr
          key={p.key}
          className="border-b border-white/5 hover:bg-white/[0.03]"
        >
          <td className={head} title={t(hintKey(p.key))}>
            <span className="flex items-center gap-1.5 text-white/80">
              {t(`erp.perm.${p.key}`)}
              {isSensitive(p.key) && (
                <Chip tone="red">{t("erp.access.sensitive")}</Chip>
              )}
            </span>
          </td>
          {roles.map((r) => {
            const off =
              cur(r).limited && !RESTRICTED_PERMISSIONS.includes(p.key);
            const on = !off && cur(r).permissions.includes(p.key);
            const was =
              !(r.limited && !RESTRICTED_PERMISSIONS.includes(p.key)) &&
              r.permissions.includes(p.key);
            return (
              <td key={r.key} className="px-2 py-1 text-center">
                {cell(
                  on,
                  on !== was,
                  lockedRole(r) || off,
                  () => togglePerm(r, p.key),
                  t(`erp.perm.${p.key}`),
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
