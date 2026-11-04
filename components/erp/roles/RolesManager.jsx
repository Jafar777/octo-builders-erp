"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Grid3x3, History, Lock, Plus, Search, ShieldCheck, Users } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/clientApi";
import { Button, PageHeader } from "@/components/erp/ui/fields";
import RoleEditor from "./RoleEditor";
import PermissionMatrix from "./PermissionMatrix";
import PeopleAccess, { hasExceptions } from "./PeopleAccess";
import AccessHistory from "./AccessHistory";
import { Chip } from "./accessShared";

const TABS = [
  { key: "roles", icon: ShieldCheck },
  { key: "matrix", icon: Grid3x3 },
  { key: "people", icon: Users },
  { key: "history", icon: History },
];

// The Roles page: the CEO's control over what everyone sees and does.
//   Roles   — each role's permissions, data scope, restricted account, visible pages
//   Matrix  — every role side by side, edited together
//   People  — one person: their role, and exceptions to it (allow / deny, scope, pages)
//   History — who changed what
export default function RolesManager({ initialRoles }) {
  const { t, lang } = useLanguage();
  const { user: viewer } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = TABS.some((x) => x.key === params.get("tab")) ? params.get("tab") : "roles";
  const [roles, setRoles] = useState(initialRoles);
  const [people, setPeople] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [picked, setPicked] = useState(initialRoles.find((r) => r.key === "gm")?.key || initialRoles[0]?.key || null);
  const [draft, setDraft] = useState(null); // a new role's starting form (new / duplicate)
  const [query, setQuery] = useState("");

  useEffect(() => {
    api("/api/access")
      .then((data) => {
        setPeople(data.people);
        setDepartments(data.departments);
      })
      .catch(() => {});
  }, []);

  const go = (key) => router.replace(`${pathname}?tab=${key}`, { scroll: false });
  const role = draft ? null : roles.find((r) => r.key === picked) || null;
  const holdersOf = (key) => people.filter((p) => p.role === key);

  const stats = useMemo(
    () => [
      { label: t("erp.access.stats.roles"), value: roles.length },
      { label: t("erp.access.stats.people"), value: people.length },
      { label: t("erp.access.stats.exceptions"), value: people.filter((p) => hasExceptions(p.access)).length },
      { label: t("erp.access.stats.restricted"), value: roles.filter((r) => r.limited).length },
    ],
    [roles, people, t]
  );

  function savedRole(saved, created) {
    setRoles((prev) => (prev.some((r) => r.key === saved.key) ? prev.map((r) => (r.key === saved.key ? { ...r, ...saved } : r)) : [...prev, saved]));
    if (created) {
      setDraft(null);
      setPicked(saved.key);
    }
  }

  const q = query.trim().toLowerCase();
  const listed = roles.filter((r) => !q || `${r.name?.ar} ${r.name?.en} ${r.key}`.toLowerCase().includes(q));

  return (
    <div>
      <PageHeader
        title={t("erp.access.title")}
        subtitle={t("erp.access.subtitle")}
        actions={
          <Button
            onClick={() => {
              setDraft({ name: { ar: "", en: "" }, description: { ar: "", en: "" }, permissions: [], scope: "self", limited: false, pages: [], crossDepartment: false });
              go("roles");
            }}
          >
            <Plus size={16} /> {t("erp.access.newRole")}
          </Button>
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
            <p className="text-xs text-white/45">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-white/10">
        {TABS.map(({ key, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => go(key)}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition ${
              tab === key ? "border-brand-orange text-white" : "border-transparent text-white/50 hover:text-white"
            }`}
          >
            <Icon size={15} /> {t(`erp.access.tab.${key}`)}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "roles" && (
          <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <div className="space-y-2">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("erp.access.search")}
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pe-3 ps-9 text-sm outline-none focus:border-white/30"
                />
              </div>
              <ul className="space-y-1 lg:max-h-[70vh] lg:overflow-y-auto">
                {draft && (
                  <li>
                    <div className="rounded-xl border border-dashed border-brand-orange/60 bg-brand-orange/10 px-3 py-2.5 text-sm">{draft.name[lang] || t("erp.access.newRole")}</div>
                  </li>
                )}
                {listed.map((r) => (
                  <li key={r.key}>
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(null);
                        setPicked(r.key);
                      }}
                      className={`w-full rounded-xl px-3 py-2.5 text-start transition ${!draft && picked === r.key ? "bg-brand-orange/15 ring-1 ring-brand-orange/50" : "hover:bg-white/5"}`}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        {r.name?.[lang] || r.key}
                        {(r.top || r.key === "user") && <Lock size={12} className="text-white/35" />}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        <Chip tone="sky">{t(`erp.roles.scope_${r.scope}`)}</Chip>
                        {r.limited && <Chip tone="red">{t("erp.access.restrictedChip")}</Chip>}
                        {r.crossDepartment && !r.top && <Chip tone="green">{t("erp.access.work.anyChip")}</Chip>}
                        <span className="text-[10px] text-white/35">
                          {r.permissions.length} · {t("erp.access.peopleCount", { n: r.userCount })}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {draft || role ? (
              <RoleEditor
                key={draft ? `new-${draft.name.en}` : role.key}
                role={role}
                seed={draft}
                holders={role ? holdersOf(role.key) : []}
                viewer={viewer}
                onSaved={savedRole}
                onDeleted={(key) => {
                  setRoles((prev) => prev.filter((r) => r.key !== key));
                  setPicked(roles.find((r) => r.key !== key)?.key || null);
                }}
                onDuplicate={(form) => setDraft(form)}
              />
            ) : null}
          </div>
        )}

        {tab === "matrix" && <PermissionMatrix roles={roles} viewer={viewer} onSaved={(saved) => savedRole(saved, false)} />}

        {tab === "people" && (
          <PeopleAccess
            people={people}
            roles={roles}
            departments={departments}
            viewer={viewer}
            onPersonChanged={(next) => {
              const before = people.find((p) => p.id === next.id);
              setPeople((prev) => prev.map((p) => (p.id === next.id ? next : p)));
              if (before && before.role !== next.role) {
                setRoles((prev) =>
                  prev.map((r) =>
                    r.key === before.role ? { ...r, userCount: Math.max(0, r.userCount - 1) } : r.key === next.role ? { ...r, userCount: r.userCount + 1 } : r
                  )
                );
              }
            }}
          />
        )}

        {tab === "history" && <AccessHistory roles={roles} departments={departments} />}
      </div>
    </div>
  );
}
