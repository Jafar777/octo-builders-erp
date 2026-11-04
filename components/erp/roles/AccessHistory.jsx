"use client";

import { useCallback, useEffect, useState } from "react";
import { History, KeyRound, ShieldCheck, UserCog } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api } from "@/lib/clientApi";
import { Button } from "@/components/erp/ui/fields";
import { Chip } from "./accessShared";

const ICON = { role: ShieldCheck, access: KeyRound, user: UserCog };

// Who changed which role or person, and what exactly (lib/audit.js entries).
export default function AccessHistory({ roles, departments = [] }) {
  const { t, lang } = useLanguage();
  const [logs, setLogs] = useState([]);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const roleName = (k) => roles.find((r) => r.key === k)?.name?.[lang] || k;

  const load = useCallback((before) => {
    api(`/api/access/history${before ? `?before=${encodeURIComponent(before)}` : ""}`)
      .then((data) => {
        setLogs((prev) => (before ? [...prev, ...data.logs] : data.logs));
        setDone(data.logs.length < 60);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const perm = (p) => t(`erp.perm.${p}`);
  const page = (p) => t(`erp.nav.${p}`);
  const dep = (id) => departments.find((d) => d.id === id)?.name?.[lang] || "—";
  const any = (v) => t(v === true ? "erp.access.work.anyYes" : v === false ? "erp.access.work.anyNo" : "erp.access.person.inherit");
  const diffChips = (d, label, fmt, tone) => d?.length > 0 && d.map((x) => <Chip key={`${label}${x}`} tone={tone}>{`${label} ${fmt(x)}`}</Chip>);

  function details(l) {
    const d = l.details || {};
    const H = (k, v) => t(`erp.access.history.${k}`, v);
    if (l.action === "user.role_changed") return <Chip tone="sky">{H("roleChange", { from: roleName(d.from), to: roleName(d.to) })}</Chip>;
    return (
      <>
        {diffChips(d.permissions?.added, "+", perm, "green")}
        {diffChips(d.permissions?.removed, "−", perm, "red")}
        {diffChips(d.grant?.added, `${H("granted")}:`, perm, "green")}
        {diffChips(d.grant?.removed, `− ${H("granted")}:`, perm, "plain")}
        {diffChips(d.deny?.added, `${H("denied")}:`, perm, "red")}
        {diffChips(d.deny?.removed, `− ${H("denied")}:`, perm, "plain")}
        {diffChips(d.pages?.added, "+", page, "green")}
        {diffChips(d.pages?.removed, "−", page, "red")}
        {diffChips(d.hiddenPages?.added, `${H("pagesHidden")}:`, page, "red")}
        {d.scope && <Chip tone="sky">{H("scope", { from: d.scope.from ? t(`erp.roles.scope_${d.scope.from}`) : "—", to: d.scope.to ? t(`erp.roles.scope_${d.scope.to}`) : "—" })}</Chip>}
        {diffChips(d.workDepartments?.added, `${H("workAdded")}:`, dep, "green")}
        {diffChips(d.workDepartments?.removed, `${H("workRemoved")}:`, dep, "red")}
        {d.crossDepartment && <Chip tone="green">{`${t("erp.access.work.title")}: ${any(d.crossDepartment.from)} → ${any(d.crossDepartment.to)}`}</Chip>}
        {d.limited && <Chip tone="orange">{H(d.limited.to ? "restrictedOn" : "restrictedOff")}</Chip>}
      </>
    );
  }

  if (!loading && !logs.length) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 text-sm text-white/40">
        <History size={22} />
        {t("erp.access.history.empty")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ol className="relative space-y-2 border-s border-white/10 ps-5">
        {logs.map((l) => {
          const Icon = ICON[l.action.split(".")[0]] || History;
          const target = l.entityType === "role" ? roleName(l.entityId) : l.target;
          return (
            <li key={l.id} className="relative rounded-2xl border border-white/10 bg-white/[0.02] p-3">
              <span className="absolute -start-[29px] top-3 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-brand-navy text-white/60">
                <Icon size={12} />
              </span>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm">
                  <span className="font-semibold">{l.actor}</span> <span className="text-white/55">{t(`erp.access.history.${l.action.replace(".", "_")}`)}</span>{" "}
                  <span className="font-semibold">{target}</span>
                </p>
                <time className="text-[11px] text-white/35">{new Date(l.createdAt).toLocaleString(lang === "ar" ? "ar" : "en-GB", { dateStyle: "medium", timeStyle: "short" })}</time>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">{details(l)}</div>
            </li>
          );
        })}
      </ol>
      {!done && (
        <Button variant="ghost" loading={loading} onClick={() => {
            setLoading(true);
            load(logs[logs.length - 1]?.createdAt);
          }}>
          {t("erp.access.history.more")}
        </Button>
      )}
    </div>
  );
}
