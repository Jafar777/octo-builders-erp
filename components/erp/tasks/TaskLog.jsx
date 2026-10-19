"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowUp, CalendarDays, ChevronLeft, ChevronRight, ExternalLink, FileSpreadsheet, Loader2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api } from "@/lib/clientApi";
import { formatDateTime, locale } from "@/lib/formatTime";
import Avatar from "@/components/erp/ui/Avatar";
import { Button, PageHeader } from "@/components/erp/ui/fields";
import { StatusBadge, taskHeading } from "@/components/erp/tasks/TaskRow";
import TaskDrawer from "@/components/erp/tasks/TaskDrawer";
import Stars from "@/components/erp/tasks/Stars";
import { useTaskLookups } from "@/components/erp/tasks/useTaskLookups";
import { formatDuration, PRIORITY_STYLE, revisionLabel, useNow, liveActiveMs } from "@/components/erp/tasks/taskUi";
import { Skeleton } from "@/components/erp/ui/Loading";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const pad = (n) => String(n).padStart(2, "0");
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const shiftMonth = (month, by) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const time = (d) => (d ? new Date(d).getTime() : null);
const FINISHED = ["approved", "done"];
const ACTIVE = ["todo", "in_progress", "on_hold", "help"];

function DateCell({ value, lang, danger }) {
  if (!value) return <span className="text-white/25">—</span>;
  return <span className={danger ? "text-red-300" : ""}>{formatDateTime(value, lang)}</span>;
}

function Person({ person }) {
  if (!person) return <span className="text-white/25">—</span>;
  return (
    <span className="flex items-center gap-2">
      <Avatar name={person.name} src={person.avatarUrl} size={22} />
      {person.name}
    </span>
  );
}

// Time spent, with a bar against the allowed hours when there are any.
function TimeCell({ task, now }) {
  const spent = liveActiveMs(task, now);
  const max = (task.maxHours || 0) * 3600000;
  const over = max > 0 && spent > max;
  return (
    <span className="block min-w-28" dir="ltr">
      <span className={over ? "text-red-300" : task.status === "in_progress" ? "text-sky-300" : ""}>{formatDuration(spent)}</span>
      {max > 0 && <span className="text-white/35"> / {formatDuration(max)}</span>}
      {max > 0 && (
        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/10">
          <span className={`block h-full rounded-full ${over ? "bg-red-400" : "bg-sky-400"}`} style={{ width: `${Math.min(100, (spent / max) * 100)}%` }} />
        </span>
      )}
    </span>
  );
}

function Stat({ label, value, tone = "text-white" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <p className="text-xs text-white/45">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone}`} dir="ltr">
        {value}
      </p>
    </div>
  );
}

export default function TaskLog() {
  const { t, lang } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lookups = useTaskLookups();
  const initialMonth = MONTH_RE.test(searchParams.get("month") || "") ? searchParams.get("month") : thisMonth();
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState(null); // { month, tasks }
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState({ key: "created", dir: -1 });
  const [openId, setOpenId] = useState(searchParams.get("task"));
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (m) => {
    setLoading(true);
    const d = await api(`/api/tasks/log?month=${m}`).catch(() => null);
    if (d) setData(d);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(month);
  }, [load, month]);

  function go(next, taskId = openId) {
    const q = new URLSearchParams({ month: next });
    if (taskId) q.set("task", taskId);
    router.replace(`/dashboard/task-log?${q}`, { scroll: false });
  }
  function changeMonth(next) {
    if (!MONTH_RE.test(next)) return;
    setMonth(next);
    go(next);
  }
  function open(id) {
    setOpenId(id);
    go(month, id);
  }

  const tasks = useMemo(() => data?.tasks || [], [data]);
  const now = useNow(tasks.some((x) => x.status === "in_progress"), 30000);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return new Intl.DateTimeFormat(locale(lang), { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
  }, [month, lang]);

  // One list drives the table, the sorting and the Excel export.
  const columns = useMemo(() => {
    const tag = (k) => lookups.tag(k)?.name?.[lang] || k;
    return [
      { key: "number", sort: (x) => x.number, excel: (x) => x.number, width: 8 },
      {
        key: "task",
        sort: (x) => taskHeading(x, lang),
        excel: (x) => taskHeading(x, lang),
        width: 36,
        cell: (x) => (
          <span className="block min-w-56 max-w-80">
            <span className="block truncate font-medium text-white" title={taskHeading(x, lang)}>
              {taskHeading(x, lang)}
            </span>
            <span className="mt-1 flex flex-wrap gap-1">
              {x.kind !== "task" && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/70">{t(`erp.tasks.kind.${x.kind}`)}</span>}
              {x.stage && x.revision > 0 && (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/70" dir="ltr">
                  {revisionLabel(x.revision)}
                </span>
              )}
              {x.priority !== "normal" && <span className={`rounded-full px-2 py-0.5 text-[11px] ${PRIORITY_STYLE[x.priority]}`}>{t(`erp.tasks.priority.${x.priority}`)}</span>}
            </span>
          </span>
        ),
      },
      { key: "status", sort: (x) => t(`erp.tasks.status.${x.status}`), excel: (x) => t(`erp.tasks.status.${x.status}`), width: 16, cell: (x) => <StatusBadge status={x.status} /> },
      { key: "project", sort: (x) => x.project?.name?.[lang] || "", excel: (x) => x.project?.name?.[lang] || "", width: 26, cell: (x) => x.project?.name?.[lang] },
      { key: "department", sort: (x) => (x.department ? lookups.departmentName(x.department) : ""), excel: (x) => (x.department ? lookups.departmentName(x.department) : ""), width: 20, cell: (x) => x.department && lookups.departmentName(x.department) },
      { key: "type", sort: (x) => lookups.typeName(x.type), excel: (x) => lookups.typeName(x.type), width: 18, cell: (x) => lookups.typeName(x.type) },
      { key: "assignee", sort: (x) => x.assignee?.name || "", excel: (x) => x.assignee?.name || "", width: 22, cell: (x) => <Person person={x.assignee} /> },
      { key: "createdBy", sort: (x) => x.createdBy?.name || "", excel: (x) => x.createdBy?.name || "", width: 22, cell: (x) => <Person person={x.createdBy} /> },
      { key: "created", sort: (x) => time(x.createdAt), excel: (x) => (x.createdAt ? new Date(x.createdAt) : null), date: true, cell: (x) => <DateCell value={x.createdAt} lang={lang} /> },
      { key: "started", sort: (x) => time(x.startedAt), excel: (x) => (x.startedAt ? new Date(x.startedAt) : null), date: true, cell: (x) => <DateCell value={x.startedAt} lang={lang} /> },
      { key: "due", sort: (x) => time(x.dueAt), excel: (x) => (x.dueAt ? new Date(x.dueAt) : null), date: true, cell: (x) => <DateCell value={x.dueAt} lang={lang} danger={x.late} /> },
      { key: "submitted", sort: (x) => time(x.submittedAt), excel: (x) => (x.submittedAt ? new Date(x.submittedAt) : null), date: true, cell: (x) => <DateCell value={x.submittedAt} lang={lang} /> },
      {
        key: "late",
        sort: (x) => (x.late ? 1 : 0),
        excel: (x) => (x.late ? t("erp.taskLog.yes") : t("erp.taskLog.no")),
        width: 10,
        cell: (x) =>
          x.late ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-300">
              <AlertTriangle size={12} /> {t("erp.taskLog.yes")}
            </span>
          ) : (
            <span className="text-white/35">{t("erp.taskLog.no")}</span>
          ),
      },
      { key: "timeSpent", sort: (x) => liveActiveMs(x, now), excel: (x) => Math.round((liveActiveMs(x, now) / 3600000) * 100) / 100, width: 14, cell: (x) => <TimeCell task={x} now={now} /> },
      { key: "allowed", sort: (x) => x.maxHours || x.estimatedHours || 0, excel: (x) => x.maxHours || x.estimatedHours || null, width: 12, cell: (x) => (x.maxHours || x.estimatedHours ? <span dir="ltr">{x.maxHours || x.estimatedHours}h</span> : null) },
      { key: "onHold", sort: (x) => x.holdMs || 0, excel: (x) => Math.round(((x.holdMs || 0) / 3600000) * 100) / 100, width: 12, cell: (x) => (x.holdMs > 0 ? <span dir="ltr">{formatDuration(x.holdMs)}</span> : null) },
      { key: "reviewedBy", sort: (x) => x.reviewedBy?.name || "", excel: (x) => x.reviewedBy?.name || "", width: 22, cell: (x) => <Person person={x.reviewedBy} /> },
      { key: "reviewedAt", sort: (x) => time(x.reviewedAt), excel: (x) => (x.reviewedAt ? new Date(x.reviewedAt) : null), date: true, cell: (x) => <DateCell value={x.reviewedAt} lang={lang} /> },
      { key: "stars", sort: (x) => x.stars || 0, excel: (x) => x.stars || null, width: 8, cell: (x) => (x.stars > 0 ? <Stars value={x.stars} size={13} /> : null) },
      {
        key: "ratings",
        sort: (x) => x.ratings.length,
        excel: (x) => x.ratings.map(tag).join(lang === "ar" ? "، " : ", "),
        width: 30,
        cell: (x) =>
          x.ratings.length > 0 && (
            <span className="flex min-w-40 flex-wrap gap-1">
              {x.ratings.map((r) => (
                <span key={r} className={`rounded-full px-2 py-0.5 text-[11px] ${lookups.tag(r)?.kind === "error" ? "bg-red-500/20 text-red-200" : "bg-emerald-500/20 text-emerald-200"}`}>
                  {tag(r)}
                </span>
              ))}
            </span>
          ),
      },
      { key: "rejectCause", sort: (x) => x.rejectCause || "", excel: (x) => (x.rejectCause ? t(`erp.tasks.cause.${x.rejectCause}`) : ""), width: 18, cell: (x) => x.rejectCause && t(`erp.tasks.cause.${x.rejectCause}`) },
      {
        key: "headNotes",
        sort: (x) => x.headNotes || "",
        excel: (x) => x.headNotes || "",
        width: 40,
        cell: (x) =>
          x.headNotes && (
            <span className="block max-w-64 truncate" title={x.headNotes}>
              {x.headNotes}
            </span>
          ),
      },
      {
        key: "employeeNotes",
        sort: (x) => x.employeeNotes || "",
        excel: (x) => x.employeeNotes || "",
        width: 40,
        cell: (x) =>
          x.employeeNotes && (
            <span className="block max-w-64 truncate" title={x.employeeNotes}>
              {x.employeeNotes}
            </span>
          ),
      },
      {
        key: "deliveryLink",
        sort: (x) => (x.deliveryLink ? 1 : 0),
        excel: (x) => x.deliveryLink || "",
        width: 40,
        cell: (x) =>
          x.deliveryLink && (
            <a
              href={x.deliveryLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-brand-orange hover:underline"
            >
              {t("erp.tasks.openLink")} <ExternalLink size={12} />
            </a>
          ),
      },
    ];
  }, [lookups, lang, t, now]);

  const rows = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key) || columns[0];
    return tasks.slice().sort((a, b) => {
      const va = col.sort(a);
      const vb = col.sort(b);
      // Empty values always last, whichever way.
      if (va == null || va === "") return vb == null || vb === "" ? 0 : 1;
      if (vb == null || vb === "") return -1;
      return (typeof va === "string" ? va.localeCompare(vb, locale(lang)) : va - vb) * sort.dir;
    });
  }, [tasks, columns, sort, lang]);

  const stats = useMemo(() => {
    const rated = tasks.filter((x) => x.stars > 0);
    return {
      total: tasks.length,
      finished: tasks.filter((x) => FINISHED.includes(x.status)).length,
      active: tasks.filter((x) => ACTIVE.includes(x.status)).length,
      review: tasks.filter((x) => x.status === "submitted").length,
      rejected: tasks.filter((x) => x.status === "rejected").length,
      late: tasks.filter((x) => x.late).length,
      hours: tasks.reduce((sum, x) => sum + liveActiveMs(x, now), 0),
      stars: rated.length ? (rated.reduce((s, x) => s + x.stars, 0) / rated.length).toFixed(1) : "—",
    };
  }, [tasks, now]);

  function toggleSort(key) {
    setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: 1 }));
  }

  async function exportExcel() {
    setExporting(true);
    try {
      const mod = await import("exceljs");
      const ExcelJS = mod.default || mod;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Octo Builders";
      const ws = wb.addWorksheet(month);
      ws.columns = columns.map((c) => ({
        header: t(`erp.taskLog.col.${c.key}`),
        key: c.key,
        width: c.width || 20,
        style: c.date ? { numFmt: "yyyy-mm-dd hh:mm" } : undefined,
      }));
      rows.forEach((x) => ws.addRow(Object.fromEntries(columns.map((c) => [c.key, c.excel(x)]))));
      const head = ws.getRow(1);
      head.font = { bold: true, color: { argb: "FFFFFFFF" } };
      head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
      ws.views = [{ rightToLeft: lang === "ar", state: "frozen", ySplit: 1, xSplit: 2 }];
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

      const blob = new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `task-log-${month}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setExporting(false);
    }
  }

  const current = month === thisMonth();
  // Sticky first two columns (# and task) so the row stays readable while scrolling sideways.
  const stickyFirst = "sticky start-0 z-10 w-16 min-w-16";
  const stickySecond = "sticky start-16 z-10 border-e border-white/10";

  return (
    <div>
      <PageHeader
        title={t("erp.nav.taskLog")}
        subtitle={t("erp.taskLog.subtitle")}
        actions={
          <Button variant="ghost" onClick={exportExcel} disabled={exporting || !rows.length}>
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
            {t("erp.taskLog.export")}
          </Button>
        }
      />

      {/* The one filter: the month */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-2xl border border-white/10 bg-white/[0.03] p-1">
          <button
            type="button"
            onClick={() => changeMonth(shiftMonth(month, -1))}
            className="rounded-xl p-2 text-white/60 hover:bg-white/10 hover:text-white"
            aria-label={t("erp.taskLog.prevMonth")}
          >
            <ChevronLeft size={18} className="rtl:rotate-180" />
          </button>
          <label className="relative flex min-w-48 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2 font-semibold hover:bg-white/5">
            <CalendarDays size={16} className="text-brand-orange" />
            {monthLabel}
            {/* Native month picker under the label: click anywhere on it to choose. */}
            <input
              type="month"
              value={month}
              onChange={(e) => changeMonth(e.target.value)}
              onClick={(e) => e.currentTarget.showPicker?.()}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label={t("erp.taskLog.month")}
            />
          </label>
          <button
            type="button"
            onClick={() => changeMonth(shiftMonth(month, 1))}
            className="rounded-xl p-2 text-white/60 hover:bg-white/10 hover:text-white"
            aria-label={t("erp.taskLog.nextMonth")}
          >
            <ChevronRight size={18} className="rtl:rotate-180" />
          </button>
        </div>
        {!current && (
          <button type="button" onClick={() => changeMonth(thisMonth())} className="text-sm text-brand-orange hover:underline">
            {t("erp.taskLog.thisMonth")}
          </button>
        )}
        {loading && data && <Loader2 size={16} className="animate-spin text-white/40" />}
      </div>

      {/* Month at a glance */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        <Stat label={t("erp.taskLog.stat.total")} value={stats.total} />
        <Stat label={t("erp.taskLog.stat.finished")} value={stats.finished} tone="text-emerald-300" />
        <Stat label={t("erp.taskLog.stat.active")} value={stats.active} tone="text-sky-300" />
        <Stat label={t("erp.taskLog.stat.review")} value={stats.review} tone="text-brand-orange" />
        <Stat label={t("erp.taskLog.stat.rejected")} value={stats.rejected} tone="text-red-300" />
        <Stat label={t("erp.taskLog.stat.late")} value={stats.late} tone={stats.late ? "text-red-300" : "text-white"} />
        <Stat label={t("erp.taskLog.stat.hours")} value={formatDuration(stats.hours)} />
        <Stat label={t("erp.taskLog.stat.stars")} value={stats.stars} tone="text-amber-300" />
      </div>

      {!data ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className={`overflow-hidden rounded-2xl border border-white/10 transition-opacity ${loading ? "opacity-60" : "animate-fade-up"}`}>
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-20 bg-brand-navy">
                <tr className="border-b border-white/10">
                  {columns.map((c, i) => (
                    <th
                      key={c.key}
                      className={`whitespace-nowrap bg-brand-navy px-3 py-3 text-start text-xs font-semibold uppercase tracking-wider text-white/50 ${
                        i === 0 ? stickyFirst : i === 1 ? stickySecond : ""
                      }`}
                    >
                      <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-white">
                        {t(`erp.taskLog.col.${c.key}`)}
                        {sort.key === c.key && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => (
                  <tr
                    key={x.id}
                    onClick={() => open(x.id)}
                    className="group cursor-pointer border-b border-white/5 text-white/75 last:border-0 hover:bg-white/[0.04]"
                  >
                    {columns.map((c, i) => (
                      <td
                        key={c.key}
                        className={`whitespace-nowrap px-3 py-2.5 align-middle ${
                          i === 0 ? `${stickyFirst} bg-brand-navy text-xs text-white/40 group-hover:bg-[#192c3a]` : i === 1 ? `${stickySecond} bg-brand-navy group-hover:bg-[#192c3a]` : ""
                        }`}
                        dir={i === 0 ? "ltr" : undefined}
                      >
                        {i === 0 ? `#${x.number}` : c.cell(x) || <span className="text-white/25">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className="py-16 text-center text-white/40">{t("erp.taskLog.none", { month: monthLabel })}</p>}
          </div>
        </div>
      )}

      <TaskDrawer taskId={openId} lookups={lookups} onClose={() => open(null)} onChanged={() => load(month)} onOpenTask={open} />
    </div>
  );
}
