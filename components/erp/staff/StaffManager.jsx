"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, Pencil, Search } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useOnlineUsers } from "@/context/RealtimeContext";
import { api } from "@/lib/clientApi";
import { formatDate } from "@/lib/formatTime";
import Avatar from "@/components/erp/ui/Avatar";
import Modal from "@/components/erp/ui/Modal";
import { PageHeader } from "@/components/erp/ui/fields";
import StaffEditor from "@/components/erp/staff/StaffEditor";
import EmployeeFile from "@/components/erp/staff/EmployeeFile";
import KpiRing from "@/components/erp/staff/KpiRing";
import { SkillRequestsPanel } from "@/components/erp/hr/SkillRequests";
import TraineeBadge from "@/components/erp/ui/TraineeBadge";
import { EmptyState, ShowMore, SortTh, TableToolbar, useTableTools } from "@/components/erp/ui/DataTools";

const FILTERS = ["all", "pending", "active", "inactive"];

// `canFile` (HR and the general manager): each row opens the employee's full HR file
// and shows their KPI ring for the current month.
export default function StaffManager({ initialStaff, roles, org, canManage, canFile, meId, month, currencies, canApproveSkills }) {
  const { t, lang } = useLanguage();
  const searchParams = useSearchParams();
  const online = useOnlineUsers();
  const [staff, setStaff] = useState(initialStaff);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(FILTERS.includes(searchParams.get("filter")) ? searchParams.get("filter") : "all");
  const [editing, setEditing] = useState(null);
  // ?person=<id> opens that employee's file (links from notifications and the home page).
  const [open, setOpen] = useState(() => new Set(canFile && searchParams.get("person") ? [searchParams.get("person")] : []));
  const [hrRows, setHrRows] = useState({});

  const loadHr = useCallback(() => {
    if (!canFile) return;
    api(`/api/hr/overview?month=${month}`)
      .then((d) => setHrRows(Object.fromEntries(d.rows.map((r) => [r.staff.id, r]))))
      .catch(() => {});
  }, [canFile, month]);
  useEffect(() => {
    loadHr();
  }, [loadHr]);

  useEffect(() => {
    const id = searchParams.get("person");
    if (canFile && id) document.getElementById(`staff-${id}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [canFile, searchParams]);

  const toggle = (id) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const saveStaff = (saved) => setStaff((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
  const cols = canFile ? 7 : 6;

  const nameOf = (list, id) => list.find((i) => i.id === id)?.name?.[lang] || "—";
  const roleName = (key) => roles.find((r) => r.key === key)?.name?.[lang] || key;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return staff.filter((p) => {
      if (filter === "pending" && (p.role !== "user" || p.customer)) return false;
      if (filter === "active" && (p.status !== "active" || p.role === "user")) return false;
      if (filter === "inactive" && p.status !== "inactive") return false;
      return !q || p.name.toLowerCase().includes(q) || p.email.includes(q);
    });
  }, [staff, query, filter]);

  const pendingCount = staff.filter((p) => p.role === "user" && !p.customer).length;
  const tools = useTableTools(
    visible,
    {
      name: (p) => p.name || p.email,
      role: (p) => roleName(p.role),
      department: (p) => nameOf(org.departments, p.department),
      branch: (p) => nameOf(org.branches, p.branch),
      joined: (p) => p.createdAt,
      kpi: (p) => hrRows[p.id]?.kpi?.score ?? null,
    },
    { key: "staff" }
  );
  const exportColumns = [
    { label: t("auth.name"), value: (p) => p.name },
    { label: "Email", value: (p) => p.email },
    { label: t("erp.staff.role"), value: (p) => roleName(p.role) },
    { label: t("erp.org.department"), value: (p) => nameOf(org.departments, p.department) },
    { label: t("erp.org.branch"), value: (p) => nameOf(org.branches, p.branch) },
    { label: t("erp.staff.joined"), value: (p) => formatDate(p.createdAt, lang) },
  ];

  return (
    <div>
      <PageHeader title={t("erp.nav.staff")} subtitle={t("erp.staff.subtitle")} />
      {canApproveSkills && <SkillRequestsPanel />}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-white/60" />
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

      <TableToolbar tools={tools} exportFile={t("erp.nav.staff")} exportColumns={exportColumns} />
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-white/[0.04] text-xs uppercase tracking-wider text-white/60">
            <tr>
              <SortTh tools={tools} col="name">{t("auth.name")}</SortTh>
              <SortTh tools={tools} col="role">{t("erp.staff.role")}</SortTh>
              <SortTh tools={tools} col="department">{t("erp.org.department")}</SortTh>
              <SortTh tools={tools} col="branch">{t("erp.org.branch")}</SortTh>
              <SortTh tools={tools} col="joined">{t("erp.staff.joined")}</SortTh>
              {canFile && <SortTh tools={tools} col="kpi" align="center">KPI</SortTh>}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {tools.shown.map((p) => {
              const expanded = canFile && open.has(p.id);
              const kpi = hrRows[p.id]?.kpi;
              return (
              <Fragment key={p.id}>
              <tr
                id={`staff-${p.id}`}
                onClick={canFile ? () => toggle(p.id) : undefined}
                className={`scroll-mt-4 border-t border-white/5 hover:bg-white/[0.03] ${canFile ? "cursor-pointer" : ""} ${expanded ? "bg-white/[0.04]" : ""}`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={p.name || p.email} src={p.avatarUrl} size={36} online={online.size ? online.has(p.id) : undefined} />
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate font-medium">
                        <span className="truncate">{p.name || "—"}</span>
                        <TraineeBadge id={p.id} />
                      </p>
                      <p className="truncate text-xs text-white/60" dir="ltr">
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
                    {p.role === "user" ? t(p.customer ? "erp.staff.customer" : "erp.staff.pending") : roleName(p.role)}
                  </span>
                  {p.status === "inactive" && (
                    <span className="ms-2 rounded-full bg-red-500/15 px-2.5 py-1 text-xs text-red-400">{t("erp.staff.inactive")}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-white/70">{nameOf(org.departments, p.department)}</td>
                <td className="px-4 py-3 text-white/70">{nameOf(org.branches, p.branch)}</td>
                <td className="px-4 py-3 text-white/50">{formatDate(p.createdAt, lang)}</td>
                {canFile && (
                  <td className="px-4 py-2 text-center">
                    <KpiRing score={kpi?.score ?? null} label={kpi ? `${kpi.score} · ${kpi.grade?.[lang] || ""}` : t("erp.staffFile.noKpi")} />
                  </td>
                )}
                <td className="px-4 py-3 text-end">
                  {canFile ? (
                    <span
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/60 transition-transform ${expanded ? "rotate-180 text-white" : ""}`}
                      aria-label={t("erp.staffFile.open")}
                      aria-expanded={expanded}
                      role="button"
                    >
                      <ChevronDown size={16} />
                    </span>
                  ) : canManage && (
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
              {expanded && (
                <tr className="border-t border-white/5 bg-white/[0.02]">
                  <td colSpan={cols} className="px-4 py-5">
                    <EmployeeFile
                      person={p}
                      hrRow={hrRows[p.id]}
                      roles={roles}
                      org={org}
                      canManage={canManage}
                      meId={meId}
                      currencies={currencies}
                      month={month}
                      onStaffSaved={(saved) => {
                        saveStaff(saved);
                        loadHr();
                      }}
                      onHrChanged={loadHr}
                    />
                  </td>
                </tr>
              )}
              </Fragment>
              );
            })}
            {tools.view.length === 0 && (
              <tr>
                <td colSpan={cols}>
                  <EmptyState compact title={query || tools.query ? t("erp.ux.noMatches") : t("erp.ux.noStaff")} text={query || tools.query ? t("erp.ux.noMatchesText") : t("erp.ux.noStaffText")} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <ShowMore tools={tools} />
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
              saveStaff(saved);
              setEditing(null);
            }}
          />
        )}
      </Modal>
    </div>
  );
}
