"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BookmarkCheck,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Crosshair,
  Diamond,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Trash2,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDateTime, locale } from "@/lib/formatTime";
import {
  criticalPath,
  DAY,
  FINAL_STATUSES as FINAL,
  HOUR,
  isWorkingDate,
  milestoneState,
  nextWorkMoment,
  officeDate,
  placeTask,
  prevWorkEnd,
  taskProgress,
  taskSpan,
  workload,
  workMsBetween,
  workWindows,
} from "@/lib/gantt";
import Modal from "@/components/erp/ui/Modal";
import { Button, ErrorText, Input, Select, Toggle } from "@/components/erp/ui/fields";
import { SkeletonList } from "@/components/erp/ui/Loading";
import { DependencyPicker } from "@/components/erp/tasks/TaskPlanning";
import { taskHeading } from "@/components/erp/tasks/TaskRow";
import { STATUS_STYLE, toLocalInput, useNow } from "@/components/erp/tasks/taskUi";

const LABEL_W = 270;
const HEADER_H = 52;
const GROUP_H = 44;
const TASK_H = 36;
const BAR_H = 20;

// Hours view: only opening → closing hours of working days take space.
const HOUR_PX = 48;
const DAY_GAP = 8;

// px per day, and the step (hours) a drag snaps to.
const ZOOMS = {
  hour: { px: HOUR_PX * 24, snap: 1 },
  day: { px: 36, snap: 24 },
  week: { px: 14, snap: 24 },
  month: { px: 4, snap: 24 },
};

const PRIORITY_BAR = { normal: "", important: "border-s-4 border-s-amber-400", urgent: "border-s-4 border-s-red-500" };

const startOfDay = (ms) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const nextDay = (ms) => {
  const d = new Date(ms);
  d.setDate(d.getDate() + 1);
  return d.getTime();
};

// Two header rows: [top, bottom] lists of { at, label }.
function scaleTicks(zoom, from, to, lang) {
  const fmt = (opts) => new Intl.DateTimeFormat(locale(lang), opts);
  const top = [];
  const bottom = [];
  const d = new Date(from);
  if (zoom === "month") {
    d.setDate(1);
    for (; d.getTime() < to; d.setMonth(d.getMonth() + 1)) {
      if (d.getMonth() === 0 || !top.length) top.push({ at: d.getTime(), label: String(d.getFullYear()) });
      bottom.push({ at: d.getTime(), label: fmt({ month: "short" }).format(d) });
    }
    return [top, bottom];
  }
  for (; d.getTime() < to; d.setDate(d.getDate() + 1)) {
    const at = d.getTime();
    if (zoom === "hour") {
      top.push({ at, label: fmt({ weekday: "short", day: "numeric", month: "short" }).format(d) });
      for (let h = 0; h < 24; h += 3) bottom.push({ at: at + h * HOUR, label: String(h).padStart(2, "0") });
      continue;
    }
    if (d.getDate() === 1 || !top.length) top.push({ at, label: fmt({ month: "long", year: "numeric" }).format(d) });
    if (zoom === "day" || d.getDay() === 1) bottom.push({ at, label: String(d.getDate()) });
  }
  return [top, bottom];
}

const MILESTONE_COLOR = { done: "bg-emerald-400", late: "bg-red-500", risk: "bg-red-400", ok: "bg-brand-orange" };

export default function ProjectsTimeline({ projects, status }) {
  const { t, lang } = useLanguage();
  const [data, setData] = useState(null);
  const [zoom, setZoom] = useState("day");
  const [groupBy, setGroupBy] = useState("project");
  const [opts, setOpts] = useState({ workdays: true, autoShift: true, critical: false, baseline: false });
  const [collapsed, setCollapsed] = useState({});
  const [drag, setDrag] = useState(null);
  const [editing, setEditing] = useState(null);
  const [milestoneEdit, setMilestoneEdit] = useState(null); // { projectId, milestone | null }
  const [exportOpen, setExportOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const scrollRef = useRef(null);
  const chartRef = useRef(null);
  const scrolledFor = useRef("");
  const now = useNow(true, 60000);

  const load = useCallback(() => {
    api(`/api/work-projects/timeline?status=${status}`)
      .then(setData)
      .catch((err) => setError(errorText(t, err)));
  }, [status, t]);

  useEffect(() => {
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  const tasks = useMemo(() => data?.tasks || [], [data]);
  const cal = data?.calendar;
  const canSchedule = Boolean(data?.canSchedule);
  const useCal = opts.workdays && cal;
  const setTasks = useCallback((fn) => setData((d) => ({ ...d, tasks: fn(d.tasks) })), []);
  const setOpt = (key) => (value) => setOpts((o) => ({ ...o, [key]: value }));

  const { px, snap } = ZOOMS[zoom];
  const pxPerMs = px / DAY;

  const visibleIds = useMemo(() => new Set(projects.map((p) => p.id)), [projects]);
  const meta = useMemo(() => Object.fromEntries((data?.projects || []).map((p) => [p.id, p])), [data]);
  const tasksById = useMemo(() => Object.fromEntries(tasks.map((x) => [x.id, x])), [tasks]);

  // Critical path per project (tasks + milestones).
  const critical = useMemo(() => {
    if (!opts.critical) return new Set();
    const byProject = {};
    for (const task of tasks) if (task.project) (byProject[task.project.id] ||= []).push(task);
    const out = new Set();
    for (const [pid, list] of Object.entries(byProject)) {
      const nodes = list.map((x) => ({ id: x.id, status: x.status, dependsOn: x.dependsOn.map((d) => d.id), span: taskSpan(x) }));
      for (const id of criticalPath(nodes, meta[pid]?.milestones || [])) out.add(id);
    }
    return out;
  }, [opts.critical, tasks, meta]);

  const load_ = useMemo(() => (cal ? workload(tasks.filter((x) => x.project && visibleIds.has(x.project.id)), cal) : {}), [tasks, cal, visibleIds]);

  // Groups (y axis): projects, or people with their tasks.
  const groups = useMemo(() => {
    const visible = tasks.filter((x) => x.project && visibleIds.has(x.project.id)).map((x) => ({ ...x, span: taskSpan(x) }));
    const sortTasks = (list) => list.sort((a, b) => a.span.start - b.span.start);
    if (groupBy === "person") {
      const byPerson = {};
      for (const x of visible) if (x.assignee) (byPerson[x.assignee.id] ||= []).push(x);
      return (data?.people || [])
        .filter((p) => byPerson[p.id])
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((person) => ({ id: `u${person.id}`, kind: "person", person, tasks: sortTasks(byPerson[person.id]) }));
    }
    const byProject = {};
    for (const x of visible) (byProject[x.project.id] ||= []).push(x);
    return projects.map((project) => {
      const list = sortTasks(byProject[project.id] || []);
      const starts = list.map((x) => x.span.start);
      const start = project.startDate ? new Date(project.startDate).getTime() : starts.length ? Math.min(...starts) : new Date(project.createdAt).getTime();
      const end = project.dueDate ? new Date(project.dueDate).getTime() : start + DAY;
      return { id: project.id, kind: "project", project, span: { start: Math.min(start, end), end }, tasks: list, milestones: meta[project.id]?.milestones || [] };
    });
  }, [tasks, projects, visibleIds, groupBy, data, meta]);

  // Rows with their y position, and the visible date range.
  const layout = useMemo(() => {
    const rows = [];
    let y = 0;
    let min = now;
    let max = now;
    for (const g of groups) {
      rows.push({ kind: g.kind, group: g, y, h: GROUP_H });
      y += GROUP_H;
      for (const x of g.tasks) {
        min = Math.min(min, x.span.start);
        max = Math.max(max, x.span.end);
      }
      if (g.span) {
        min = Math.min(min, g.span.start);
        max = Math.max(max, g.span.end);
      }
      for (const m of g.milestones || []) max = Math.max(max, new Date(m.date).getTime());
      if (collapsed[g.id]) continue;
      for (const task of g.tasks) {
        rows.push({ kind: "task", task, group: g, y, h: TASK_H });
        y += TASK_H;
      }
    }
    const from = startOfDay(min - 3 * DAY);
    const to = Math.min(startOfDay(max + 15 * DAY), from + 3 * 365 * DAY);
    return { rows, height: y, from, to };
  }, [groups, collapsed, now]);

  const { rows, height, from, to } = layout;
  // Time ↔ pixels. Hours view: working windows side by side, nights and days off removed.
  const scale = useMemo(() => {
    if (zoom === "hour" && cal) {
      const pxMs = HOUR_PX / HOUR;
      let offset = 0;
      const segs = workWindows(from, to, cal).map((w) => {
        const seg = { ...w, offset, w: (w.end - w.start) * pxMs };
        offset += seg.w + DAY_GAP;
        return seg;
      });
      if (segs.length) {
        const last = segs.at(-1);
        // First window that ends at/after `ms` (time between windows maps to the next opening).
        const find = (ms) => {
          let lo = 0;
          let hi = segs.length - 1;
          if (ms > last.end) return null;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (segs[mid].end < ms) lo = mid + 1;
            else hi = mid;
          }
          return segs[lo];
        };
        const xOf = (ms) => {
          const seg = find(ms);
          if (!seg) return last.offset + last.w;
          return seg.offset + Math.max(0, ms - seg.start) * pxMs;
        };
        const invX = (px) => {
          const seg = segs.find((sg) => px < sg.offset + sg.w + DAY_GAP) || last;
          return seg.start + Math.min(Math.max(0, px - seg.offset), seg.w) / pxMs;
        };
        return { x: xOf, invX, width: Math.ceil(offset), segs };
      }
    }
    return { x: (ms) => (ms - from) * pxPerMs, invX: (px) => from + px / pxPerMs, width: Math.ceil((to - from) * pxPerMs), segs: null };
  }, [zoom, cal, from, to, pxPerMs]);
  const { x, width } = scale;

  const [topTicks, bottomTicks] = useMemo(() => {
    if (!scale.segs) return scaleTicks(zoom, from, to, lang);
    const dayFmt = new Intl.DateTimeFormat(locale(lang), { weekday: "short", day: "numeric", month: "short" });
    const hourFmt = new Intl.DateTimeFormat(locale(lang), { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: cal.tz });
    const top = scale.segs.map((sg) => ({ at: sg.start, label: dayFmt.format(sg.start) }));
    const bottom = [];
    for (const sg of scale.segs) for (let at = sg.start; at < sg.end; at += HOUR) bottom.push({ at, label: hourFmt.format(at) });
    return [top, bottom];
  }, [scale, zoom, from, to, lang, cal]);
  const taskRows = useMemo(() => Object.fromEntries(rows.filter((r) => r.kind === "task").map((r) => [r.task.id, r])), [rows]);

  // Office days between from and to: { at (local midnight), iso, working, w? }.
  const days = useMemo(() => {
    if (scale.segs) return scale.segs.map((sg) => ({ at: sg.start, iso: sg.iso, working: true, w: sg.w }));
    if (!cal || zoom === "month") return [];
    const out = [];
    for (let at = from; at < to && out.length < 1200; at = nextDay(at)) {
      const iso = officeDate(at + 12 * HOUR, cal);
      out.push({ at, iso, working: isWorkingDate(iso, cal) });
    }
    return out;
  }, [cal, from, to, zoom, scale]);

  const scrollToToday = useCallback(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, x(Date.now()) - 160);
  }, [x]);

  useEffect(() => {
    if (!data || scrolledFor.current === zoom) return;
    scrolledFor.current = zoom;
    scrollToToday();
  }, [data, zoom, scrollToToday]);

  // ---------- editing ----------

  const mergeTasks = useCallback((updated) => {
    const map = Object.fromEntries(updated.map((u) => [u.id, u]));
    setTasks((list) => list.map((x) => map[x.id] || x));
  }, [setTasks]);

  const save = useCallback(
    async (task, body) => {
      setError("");
      setNotice("");
      const before = data.tasks;
      setTasks((list) => list.map((x) => (x.id === task.id ? { ...x, ...body, dependsOn: x.dependsOn } : x)));
      try {
        const res = await api(`/api/tasks/${task.id}/schedule`, { method: "PATCH", body: { ...body, cascade: opts.autoShift } });
        mergeTasks([res.task, ...res.moved]);
        if (res.moved.length) setNotice(t("erp.gantt.moved", { n: res.moved.length }));
        return true;
      } catch (err) {
        setTasks(() => before);
        setError(errorText(t, err));
        return false;
      }
    },
    [data, opts.autoShift, mergeTasks, setTasks, t]
  );

  const editable = (task) => canSchedule && !FINAL.includes(task.status);

  // How far (ms, snapped) a point at time `at` moves when dragged `dx` pixels.
  const shiftFor = (at, dx) => {
    const target = scale.invX(scale.x(at) + dx);
    return Math.round((target - at) / (snap * HOUR)) * snap * HOUR;
  };

  // New position of a dragged bar, snapped to the working calendar when it's on.
  const draggedSpan = (task, mode, dx) => {
    const span = taskSpan(task);
    const shift = shiftFor(mode === "end" ? span.end : span.start, dx);
    if (!shift) return span;
    if (!useCal) {
      if (mode === "move") return { ...span, start: span.start + shift, end: span.end + shift };
      if (mode === "start") return { ...span, start: Math.min(span.start + shift, span.end - HOUR) };
      return { ...span, end: Math.max(span.end + shift, span.start + HOUR) };
    }
    if (mode === "move") return { ...span, ...placeTask(span.start + shift, workMsBetween(span.start, span.end, cal), cal) };
    if (mode === "start") return { ...span, start: Math.min(nextWorkMoment(span.start + shift, cal), span.end - HOUR) };
    return { ...span, end: Math.max(prevWorkEnd(span.end + shift, cal), span.start + HOUR) };
  };

  const beginDrag = (e, item, mode) => {
    if (e.button !== 0) return;
    const isMilestone = mode === "milestone";
    if (!(isMilestone ? canSchedule : editable(item))) return;
    e.preventDefault();
    e.stopPropagation();
    setDrag({ id: item.id, item, mode, startX: e.clientX, dx: 0, pointer: null });
  };

  useEffect(() => {
    if (!drag) return undefined;
    const onMove = (e) => {
      const rect = chartRef.current?.getBoundingClientRect();
      setDrag((d) => d && { ...d, dx: e.clientX - d.startX, pointer: rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : null });
    };
    const onUp = (e) => {
      const d = drag;
      setDrag(null);
      const dx = e.clientX - d.startX;
      const clicked = Math.abs(dx) <= 3;
      if (d.mode === "milestone") {
        if (clicked) return setMilestoneEdit({ projectId: d.item.projectId, milestone: d.item.milestone });
        const at = new Date(d.item.milestone.date).getTime();
        const shift = shiftFor(at, dx);
        if (shift) saveMilestone(d.item.projectId, { milestoneId: d.item.milestone.id, date: new Date(at + shift).toISOString() });
        return;
      }
      const task = d.item;
      if (d.mode === "link") {
        const targetId = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-task-id]")?.dataset.taskId;
        const target = tasksById[targetId];
        if (!target || target.id === task.id || !editable(target)) return;
        const ids = target.dependsOn.map((x) => x.id);
        if (!ids.includes(task.id)) save(target, { dependsOn: [...ids, task.id] });
        return;
      }
      if (clicked) return setEditing(task);
      const span = draggedSpan(task, d.mode, dx);
      const orig = taskSpan(task);
      if (span.start === orig.start && span.end === orig.end) return;
      save(task, { plannedStart: new Date(span.start).toISOString(), dueAt: new Date(span.end).toISOString() });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // Re-bind only when a drag starts or ends, not on every move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id, drag?.mode]);

  const previewSpan = (task) => {
    if (!drag || drag.id !== task.id || ["link", "milestone"].includes(drag.mode) || Math.abs(drag.dx) <= 3) return taskSpan(task);
    return draggedSpan(task, drag.mode, drag.dx);
  };

  // ---------- milestones & baselines ----------

  const setMilestones = (projectId, milestones) =>
    setData((d) => ({ ...d, projects: d.projects.map((p) => (p.id === projectId ? { ...p, milestones } : p)) }));

  async function saveMilestone(projectId, body, method = "PATCH") {
    setError("");
    try {
      const url = `/api/work-projects/${projectId}/milestones${method === "DELETE" ? `?milestoneId=${body.milestoneId}` : ""}`;
      const res = await api(url, { method, body: method === "DELETE" ? undefined : body });
      setMilestones(projectId, res.milestones);
      return true;
    } catch (err) {
      setError(errorText(t, err));
      return false;
    }
  }

  async function saveBaseline(project) {
    if (!window.confirm(t("erp.gantt.baselineConfirm", { name: project.name?.[lang] }))) return;
    setError("");
    try {
      const res = await api(`/api/work-projects/${project.id}/baseline`, { method: "POST" });
      setNotice(t("erp.gantt.baselineSaved", { n: res.count }));
      setOpts((o) => ({ ...o, baseline: true }));
      load();
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  // ---------- export ----------

  async function exportAs(kind) {
    setExportOpen(false);
    const { exportExcel, exportPdf } = await import("@/components/erp/projects/ganttExport");
    const model = { groups, cal, critical, tasksById, people: data.people, load: load_, now, lang, t, from, to, opts };
    try {
      if (kind === "excel") await exportExcel(model);
      else exportPdf(model);
    } catch (err) {
      setError(err.message === "popup_blocked" ? t("erp.gantt.popupBlocked") : errorText(t, err));
    }
  }

  // ---------- drawing ----------

  const arrows = [];
  for (const row of Object.values(taskRows)) {
    for (const dep of row.task.dependsOn || []) {
      const fromRow = taskRows[dep.id];
      if (!fromRow) continue;
      const a = previewSpan(fromRow.task);
      const b = previewSpan(row.task);
      arrows.push({
        key: `${dep.id}-${row.task.id}`,
        x1: x(a.end),
        y1: fromRow.y + TASK_H / 2,
        x2: x(b.start),
        y2: row.y + TASK_H / 2,
        conflict: b.start < a.end && !FINAL.includes(fromRow.task.status),
        critical: critical.has(dep.id) && critical.has(row.task.id),
      });
    }
  }

  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed[g.id]);
  const hourLabel = (n) => t("erp.gantt.hours", { n: Math.round(n * 10) / 10 });
  const showDays = zoom !== "month" && !scale.segs;
  const dayW = px;

  if (!data) {
    return error ? <ErrorText>{error}</ErrorText> : <SkeletonList rows={6} />;
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl border border-white/10 p-1">
          {["project", "person"].map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroupBy(g)}
              className={`rounded-lg px-3 py-1.5 text-sm ${groupBy === g ? "bg-brand-orange text-white" : "text-white/60 hover:text-white"}`}
            >
              {t(`erp.gantt.group.${g}`)}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-xl border border-white/10 p-1">
          {Object.keys(ZOOMS).map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZoom(z)}
              className={`rounded-lg px-3 py-1.5 text-sm ${zoom === z ? "bg-white/15 text-white" : "text-white/60 hover:text-white"}`}
            >
              {t(`erp.gantt.zoom.${z}`)}
            </button>
          ))}
        </div>
        <Button variant="ghost" onClick={scrollToToday}>
          <Crosshair size={15} /> {t("erp.gantt.today")}
        </Button>
        <Button variant="ghost" onClick={() => setCollapsed(allCollapsed ? {} : Object.fromEntries(groups.map((g) => [g.id, true])))}>
          {allCollapsed ? <ChevronsUpDown size={15} /> : <ChevronsDownUp size={15} />}
          {t(allCollapsed ? "erp.gantt.expandAll" : "erp.gantt.collapseAll")}
        </Button>
        <div className="relative ms-auto">
          <Button variant="ghost" onClick={() => setExportOpen((o) => !o)}>
            <Download size={15} /> {t("erp.gantt.export")}
          </Button>
          {exportOpen && (
            <div className="absolute end-0 z-30 mt-1 w-48 overflow-hidden rounded-xl border border-white/10 bg-brand-navy shadow-xl">
              <button type="button" onClick={() => exportAs("excel")} className="flex w-full items-center gap-2 px-4 py-2.5 text-start text-sm hover:bg-white/10">
                <FileSpreadsheet size={15} className="text-emerald-300" /> {t("erp.gantt.exportExcel")}
              </button>
              <button type="button" onClick={() => exportAs("pdf")} className="flex w-full items-center gap-2 px-4 py-2.5 text-start text-sm hover:bg-white/10">
                <FileText size={15} className="text-red-300" /> {t("erp.gantt.exportPdf")}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5 text-sm">
        <Toggle checked={opts.workdays} onChange={setOpt("workdays")} label={t("erp.gantt.workdays")} />
        {canSchedule && <Toggle checked={opts.autoShift} onChange={setOpt("autoShift")} label={t("erp.gantt.autoShift")} />}
        <Toggle checked={opts.critical} onChange={setOpt("critical")} label={t("erp.gantt.critical")} />
        <Toggle checked={opts.baseline} onChange={setOpt("baseline")} label={t("erp.gantt.baseline")} />
      </div>

      <p className="mb-3 text-xs text-white/45">
        {t(canSchedule ? "erp.gantt.editHint" : "erp.gantt.readOnlyHint")} {groupBy === "person" && t("erp.gantt.workloadHint")}
      </p>
      {notice && <p className="mb-3 rounded-xl bg-sky-500/10 px-4 py-2 text-sm text-sky-200">{notice}</p>}
      {error && (
        <div className="mb-3">
          <ErrorText>{error}</ErrorText>
        </div>
      )}

      <div ref={scrollRef} dir="ltr" className={`relative max-h-[72vh] overflow-auto rounded-2xl border border-white/10 bg-white/[0.02] ${drag ? "select-none" : ""}`}>
        <div style={{ width: LABEL_W + width }}>
          {/* Header: time scale */}
          <div className="sticky top-0 z-20 flex border-b border-white/10 bg-brand-navy" style={{ height: HEADER_H }}>
            <div className="sticky left-0 z-10 shrink-0 border-e border-white/10 bg-brand-navy" style={{ width: LABEL_W }} />
            <div className="relative" style={{ width }}>
              {topTicks.map((tick) => (
                <div
                  key={`t${tick.at}`}
                  className="absolute top-0 h-1/2 whitespace-nowrap border-s border-white/10 px-1.5 pt-1 text-[11px] font-medium text-white/70"
                  style={{ left: x(tick.at) }}
                >
                  {tick.label}
                </div>
              ))}
              {bottomTicks.map((tick) => (
                <div key={`b${tick.at}`} className="absolute bottom-0 h-1/2 border-s border-white/5 ps-1 pt-1 text-[10px] text-white/45" style={{ left: x(tick.at) }}>
                  {tick.label}
                </div>
              ))}
            </div>
          </div>

          <div className="flex">
            {/* Y axis */}
            <div className="sticky left-0 z-10 shrink-0 border-e border-white/10 bg-brand-navy" style={{ width: LABEL_W }}>
              {rows.map((row) =>
                row.kind === "task" ? (
                  <div
                    key={row.task.id}
                    dir="auto"
                    className="flex items-center gap-2 border-b border-white/5 pe-3 ps-8 text-xs"
                    style={{ height: TASK_H }}
                    title={taskHeading(row.task, lang)}
                  >
                    <span className="shrink-0 text-white/35" dir="ltr">
                      #{row.task.number}
                    </span>
                    <span className={`min-w-0 flex-1 truncate ${critical.has(row.task.id) ? "text-rose-300" : "text-white/80"}`}>{taskHeading(row.task, lang)}</span>
                    <span className="max-w-[80px] shrink-0 truncate text-white/40">
                      {groupBy === "person" ? row.task.project?.code || row.task.project?.name?.[lang] : row.task.assignee?.name}
                    </span>
                  </div>
                ) : (
                  <GroupLabel
                    key={row.group.id}
                    group={row.group}
                    lang={lang}
                    t={t}
                    collapsed={collapsed[row.group.id]}
                    onToggle={() => setCollapsed((c) => ({ ...c, [row.group.id]: !c[row.group.id] }))}
                    canSchedule={canSchedule}
                    onAddMilestone={() => setMilestoneEdit({ projectId: row.group.id, milestone: null })}
                    onBaseline={() => saveBaseline(row.group.project)}
                    load={row.kind === "person" ? load_[row.group.person.id] : null}
                    today={cal ? officeDate(now, cal) : ""}
                  />
                )
              )}
            </div>

            {/* Chart */}
            <div ref={chartRef} className="relative" style={{ width, height }}>
              {showDays &&
                days.map((d) =>
                  d.working ? null : (
                    <div
                      key={`w${d.at}`}
                      className="absolute top-0 h-full bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.035)_0,rgba(255,255,255,0.035)_4px,transparent_4px,transparent_8px)]"
                      style={{ left: x(d.at), width: dayW }}
                      title={d.iso}
                    />
                  )
                )}
              {bottomTicks.map((tick) => (
                <div key={`g${tick.at}`} className="absolute top-0 h-full border-s border-white/[0.04]" style={{ left: x(tick.at) }} />
              ))}
              {scale.segs?.map((sg) => (
                <div key={`d${sg.iso}`} className="absolute top-0 h-full bg-white/[0.07]" style={{ left: sg.offset + sg.w, width: DAY_GAP }} />
              ))}
              {rows.map((row) => (
                <div
                  key={`r${row.kind === "task" ? row.task.id : row.group.id}`}
                  className={`absolute inset-x-0 border-b ${row.kind === "task" ? "border-white/5" : "border-white/10 bg-white/[0.03]"}`}
                  style={{ top: row.y, height: row.h }}
                />
              ))}
              <div className="absolute top-0 z-[5] h-full w-0.5 bg-brand-orange/70" style={{ left: x(now) }} />

              {rows.map((row) => {
                if (row.kind === "project") {
                  const { project, span, milestones } = row.group;
                  const pct = Math.round((project.progress || 0) * 100);
                  return (
                    <div key={`p${project.id}`}>
                      <Link
                        href={`/dashboard/projects/${project.id}`}
                        className="absolute flex items-center overflow-hidden rounded-md border border-white/20 bg-white/10 hover:border-white/40"
                        style={{ left: x(span.start), width: Math.max(6, x(span.end) - x(span.start)), top: row.y + 14, height: GROUP_H - 28 }}
                        title={`${project.name?.[lang]} · ${pct}%`}
                      >
                        <div className="absolute inset-y-0 left-0 bg-brand-orange/50" style={{ width: `${pct}%` }} />
                        <span className="relative px-2 text-[10px] font-medium text-white">{pct}%</span>
                      </Link>
                      {milestones.map((m) => {
                        const state = milestoneState(m, tasksById, now);
                        const date = new Date(m.date).getTime();
                        const at = date + (drag?.mode === "milestone" && drag.id === m.id ? shiftFor(date, drag.dx) : 0);
                        return (
                          <div key={m.id}>
                            {opts.baseline && m.baselineDate && (
                              <span
                                className="absolute h-2.5 w-2.5 -translate-x-1/2 rotate-45 border border-white/50"
                                style={{ left: x(new Date(m.baselineDate).getTime()), top: row.y + GROUP_H / 2 - 5 }}
                                title={`${t("erp.gantt.baseline")}: ${formatDateTime(m.baselineDate, lang)}`}
                              />
                            )}
                            <button
                              type="button"
                              onPointerDown={(e) => beginDrag(e, { id: m.id, projectId: project.id, milestone: m }, "milestone")}
                              onClick={() => !canSchedule && setMilestoneEdit({ projectId: project.id, milestone: m, readOnly: true })}
                              className={`absolute z-[7] h-3.5 w-3.5 -translate-x-1/2 rotate-45 border border-white/70 shadow ${MILESTONE_COLOR[state]} ${canSchedule ? "cursor-grab" : ""}`}
                              style={{ left: x(at), top: row.y + GROUP_H / 2 - 7 }}
                              title={`◆ ${m.name} — ${formatDateTime(at, lang)} · ${t(`erp.gantt.milestoneState.${state}`)}`}
                            />
                            <span
                              className="pointer-events-none absolute z-[7] whitespace-nowrap text-[10px] text-white/70"
                              style={{ left: x(at) + 10, top: row.y + 2 }}
                              dir="auto"
                            >
                              {m.name}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                }
                if (row.kind === "person") {
                  return (
                    <LoadStrip key={`l${row.group.id}`} row={row} days={days} x={x} dayW={dayW} load={load_[row.group.person.id] || {}} capacity={row.group.person.dailyHours} t={t} />
                  );
                }
                const { task } = row;
                const span = previewSpan(task);
                const left = x(span.start);
                const barW = Math.max(8, x(span.end) - left);
                const canEdit = editable(task);
                const late = task.late && !FINAL.includes(task.status);
                const isCritical = critical.has(task.id);
                const progress = taskProgress(task, now);
                const label = `#${task.number} · ${taskHeading(task, lang)}`;
                const hasBaseline = opts.baseline && task.baselineStart && task.baselineEnd;
                const slipDays = hasBaseline ? Math.round((span.end - new Date(task.baselineEnd).getTime()) / DAY) : 0;
                const top = row.y + (TASK_H - BAR_H) / 2 - (hasBaseline ? 3 : 0);
                return (
                  <div key={task.id}>
                    {hasBaseline && (
                      <div
                        className="absolute rounded-sm bg-white/30"
                        style={{
                          left: x(new Date(task.baselineStart).getTime()),
                          width: Math.max(4, x(new Date(task.baselineEnd).getTime()) - x(new Date(task.baselineStart).getTime())),
                          top: top + BAR_H + 2,
                          height: 4,
                        }}
                        title={`${t("erp.gantt.baseline")}: ${formatDateTime(task.baselineStart, lang)} → ${formatDateTime(task.baselineEnd, lang)}`}
                      />
                    )}
                    <div className="absolute" style={{ left, top, width: barW, height: BAR_H }}>
                      <div
                        data-task-id={task.id}
                        onPointerDown={(e) => beginDrag(e, task, "move")}
                        onClick={() => !canEdit && setEditing(task)}
                        title={`${label} · ${Math.round(progress * 100)}%${span.unscheduled ? ` — ${t("erp.gantt.unscheduled")}` : ""}${isCritical ? ` — ${t("erp.gantt.critical")}` : ""}`}
                        className={`relative flex h-full items-center overflow-hidden rounded-md border text-[11px] ${STATUS_STYLE[task.status] || ""} ${PRIORITY_BAR[task.priority] || ""} ${
                          span.unscheduled ? "border-dashed" : ""
                        } ${isCritical ? "ring-2 ring-rose-500" : late ? "ring-1 ring-red-500/70" : ""} ${canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${
                          drag?.id === task.id ? "z-10 shadow-lg shadow-black/40" : ""
                        }`}
                      >
                        <div className="pointer-events-none absolute inset-y-0 left-0 bg-white/20" style={{ width: `${progress * 100}%` }} />
                        {canEdit && <span onPointerDown={(e) => beginDrag(e, task, "start")} className="absolute inset-y-0 left-0 z-[1] w-2 cursor-ew-resize hover:bg-white/30" />}
                        <span className="relative truncate px-2" dir="auto">
                          {barW > 70 ? label : `#${task.number}`}
                        </span>
                        {canEdit && <span onPointerDown={(e) => beginDrag(e, task, "end")} className="absolute inset-y-0 right-0 z-[1] w-2 cursor-ew-resize hover:bg-white/30" />}
                      </div>
                      {canEdit && (
                        <span
                          onPointerDown={(e) => beginDrag(e, task, "link")}
                          title={t("erp.tasks.addDependency")}
                          className="absolute -right-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 cursor-crosshair rounded-full border border-white/60 bg-brand-navy hover:scale-125 hover:bg-brand-orange"
                        />
                      )}
                      <span className="pointer-events-none absolute left-full top-1/2 ms-4 flex -translate-y-1/2 gap-2 whitespace-nowrap text-[10px]">
                        {task.estimatedHours > 0 && <span className="text-white/40">{hourLabel(task.estimatedHours)}</span>}
                        {hasBaseline && slipDays !== 0 && (
                          <span className={slipDays > 0 ? "text-red-300" : "text-emerald-300"}>{t("erp.gantt.slip", { n: slipDays > 0 ? `+${slipDays}` : slipDays })}</span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}

              <svg className="pointer-events-none absolute inset-0 z-[6]" width={width} height={height}>
                <defs>
                  {[
                    ["gantt-arrow", "rgba(255,255,255,0.55)"],
                    ["gantt-arrow-bad", "#f87171"],
                    ["gantt-arrow-crit", "#f43f5e"],
                  ].map(([id, fill]) => (
                    <marker key={id} id={id} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                      <path d="M0,0 L8,4 L0,8 z" fill={fill} />
                    </marker>
                  ))}
                </defs>
                {arrows.map((a) => {
                  const out = a.x1 + 10;
                  const midY = a.y2 > a.y1 ? a.y2 - TASK_H / 2 : a.y2 + TASK_H / 2;
                  const d =
                    a.x2 - 10 >= out ? `M${a.x1},${a.y1} H${out} V${a.y2} H${a.x2 - 1}` : `M${a.x1},${a.y1} H${out} V${midY} H${a.x2 - 10} V${a.y2} H${a.x2 - 1}`;
                  const kind = a.conflict ? "bad" : a.critical ? "crit" : "";
                  return (
                    <path
                      key={a.key}
                      d={d}
                      fill="none"
                      stroke={a.conflict ? "#f87171" : a.critical ? "#f43f5e" : "rgba(255,255,255,0.4)"}
                      strokeWidth={a.critical ? 2 : 1.5}
                      strokeDasharray={a.conflict ? "4 3" : undefined}
                      markerEnd={`url(#gantt-arrow${kind ? `-${kind}` : ""})`}
                    >
                      {a.conflict && <title>{t("erp.gantt.conflict")}</title>}
                    </path>
                  );
                })}
                {drag?.mode === "link" && drag.pointer && taskRows[drag.id] && (
                  <line
                    x1={x(taskSpan(drag.item).end) + 12}
                    y1={taskRows[drag.id].y + TASK_H / 2}
                    x2={drag.pointer.x}
                    y2={drag.pointer.y}
                    stroke="#f97316"
                    strokeWidth="2"
                    strokeDasharray="5 4"
                  />
                )}
              </svg>
            </div>
          </div>
        </div>
        {groups.length > 0 && tasks.length === 0 && <p className="py-10 text-center text-sm text-white/40">{t("erp.gantt.noTasks")}</p>}
      </div>

      <Legend t={t} groupBy={groupBy} />

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={t("erp.gantt.editTask")}>
        {editing && (
          <ScheduleForm
            task={editing}
            canEdit={editable(editing)}
            onCancel={() => setEditing(null)}
            onSave={async (body) => (await save(editing, body)) && setEditing(null)}
          />
        )}
      </Modal>

      <Modal
        open={Boolean(milestoneEdit)}
        onClose={() => setMilestoneEdit(null)}
        title={t(milestoneEdit?.milestone ? "erp.gantt.editMilestone" : "erp.gantt.addMilestone")}
      >
        {milestoneEdit && (
          <MilestoneForm
            projectId={milestoneEdit.projectId}
            milestone={milestoneEdit.milestone}
            readOnly={!canSchedule}
            onCancel={() => setMilestoneEdit(null)}
            onSave={async (body) => {
              const m = milestoneEdit.milestone;
              const ok = await saveMilestone(milestoneEdit.projectId, m ? { ...body, milestoneId: m.id } : body, m ? "PATCH" : "POST");
              if (ok) setMilestoneEdit(null);
            }}
            onDelete={async () => {
              if (!window.confirm(t("common.confirmDelete"))) return;
              if (await saveMilestone(milestoneEdit.projectId, { milestoneId: milestoneEdit.milestone.id }, "DELETE")) setMilestoneEdit(null);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function GroupLabel({ group, lang, t, collapsed, onToggle, canSchedule, onAddMilestone, onBaseline, load, today }) {
  const isProject = group.kind === "project";
  const title = isProject ? group.project.name?.[lang] : group.person.name;
  // People: hours planned this week (next 7 office days) against capacity.
  let weekLoad = null;
  if (load) {
    const dates = Object.keys(load).filter((d) => d >= today).sort().slice(0, 6);
    const hours = dates.reduce((n, d) => n + load[d], 0);
    weekLoad = { hours, over: dates.some((d) => load[d] > group.person.dailyHours + 0.01) };
  }
  return (
    <div className="group flex items-center gap-1 border-b border-white/10 bg-white/[0.04] pe-2" style={{ height: GROUP_H }}>
      <button type="button" dir="auto" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 ps-3 text-start text-sm font-semibold" style={{ height: GROUP_H }}>
        <ChevronDown size={15} className={`shrink-0 text-white/50 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {isProject && group.project.late && <AlertTriangle size={13} className="shrink-0 text-red-300" />}
        {weekLoad && (
          <span className={`shrink-0 text-[11px] font-normal ${weekLoad.over ? "text-red-300" : "text-white/45"}`} title={t("erp.gantt.weekLoad")}>
            {weekLoad.over && <AlertTriangle size={11} className="me-0.5 inline" />}
            {t("erp.gantt.hours", { n: Math.round(weekLoad.hours) })}
          </span>
        )}
        <span className="shrink-0 text-[11px] font-normal text-white/40">{group.tasks.length}</span>
      </button>
      {isProject && canSchedule && (
        <>
          <button type="button" onClick={onAddMilestone} title={t("erp.gantt.addMilestone")} className="rounded-md p-1.5 text-white/40 hover:bg-white/10 hover:text-white">
            <Diamond size={14} />
          </button>
          <button type="button" onClick={onBaseline} title={t("erp.gantt.saveBaseline")} className="rounded-md p-1.5 text-white/40 hover:bg-white/10 hover:text-white">
            <BookmarkCheck size={14} />
          </button>
        </>
      )}
    </div>
  );
}

// Daily planned hours of one person as bars; red above their capacity.
function LoadStrip({ row, days, x, dayW, load, capacity, t }) {
  const max = capacity * 1.5;
  const inner = GROUP_H - 10;
  return (
    <div className="pointer-events-none absolute inset-x-0" style={{ top: row.y + 5, height: inner }}>
      <div className="absolute inset-x-0 border-t border-dashed border-white/25" style={{ top: inner - (capacity / max) * inner }} />
      {days.map((d) => {
        const h = load[d.iso];
        if (!h) return null;
        const ratio = h / capacity;
        const color = ratio > 1.001 ? "bg-red-500/70" : ratio >= 0.8 ? "bg-amber-400/60" : "bg-emerald-400/50";
        return (
          <div
            key={d.iso}
            className={`pointer-events-auto absolute bottom-0 rounded-t-sm ${color}`}
            style={{ left: x(d.at) + 1, width: Math.max(2, (d.w ?? dayW) - 2), height: Math.min(1, h / max) * inner }}
            title={`${d.iso} · ${t("erp.gantt.load", { h: Math.round(h * 10) / 10, cap: capacity })}`}
          />
        );
      })}
    </div>
  );
}

function Legend({ t, groupBy }) {
  const item = (cls, label) => (
    <span className="flex items-center gap-1.5">
      <span className={cls} /> {label}
    </span>
  );
  return (
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/50">
      {item("h-3 w-5 rounded-sm ring-2 ring-rose-500", t("erp.gantt.critical"))}
      {item("h-1 w-5 rounded-sm bg-white/30", t("erp.gantt.baseline"))}
      {item("h-3 w-5 rounded-sm bg-white/20", t("erp.gantt.progress"))}
      {item("h-2.5 w-2.5 rotate-45 bg-brand-orange", t("erp.gantt.milestone"))}
      {item("h-3 w-5 rounded-sm bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.25)_0,rgba(255,255,255,0.25)_2px,transparent_2px,transparent_4px)]", t("erp.gantt.nonWorking"))}
      {groupBy === "person" && item("h-3 w-3 rounded-sm bg-red-500/70", t("erp.gantt.overloaded"))}
    </div>
  );
}

function ScheduleForm({ task, canEdit, onSave, onCancel }) {
  const { t, lang } = useLanguage();
  const span = taskSpan(task);
  const [form, setForm] = useState({
    plannedStart: toLocalInput(new Date(span.start)),
    dueAt: toLocalInput(task.dueAt || new Date(span.end)),
    estimatedHours: String(task.estimatedHours || 0),
    priority: task.priority,
    dependsOn: (task.dependsOn || []).map((d) => d.id),
  });
  const [busy, setBusy] = useState(false);
  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    await onSave({
      plannedStart: form.plannedStart ? new Date(form.plannedStart).toISOString() : null,
      dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
      estimatedHours: Number(form.estimatedHours) || 0,
      priority: form.priority,
      dependsOn: form.dependsOn,
    });
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <p className="font-semibold">
          <span className="text-white/40" dir="ltr">
            #{task.number}
          </span>{" "}
          {taskHeading(task, lang)}
        </p>
        <p className="mt-0.5 text-xs text-white/45">{[task.project?.name?.[lang], task.assignee?.name].filter(Boolean).join(" · ")}</p>
        {task.baselineEnd && (
          <p className="mt-1 text-xs text-white/45">
            {t("erp.gantt.baseline")}: {formatDateTime(task.baselineStart, lang)} → {formatDateTime(task.baselineEnd, lang)}
          </p>
        )}
      </div>
      <fieldset disabled={!canEdit} className="space-y-4 disabled:opacity-60">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input type="datetime-local" label={t("erp.gantt.start")} value={form.plannedStart} onChange={set("plannedStart")} />
          <Input type="datetime-local" label={t("erp.gantt.due")} value={form.dueAt} onChange={set("dueAt")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input type="number" min="0" max="1000" step="0.5" label={t("erp.gantt.estimatedHours")} value={form.estimatedHours} onChange={set("estimatedHours")} dir="ltr" />
          <Select
            label={t("erp.tasks.priorityLabel")}
            value={form.priority}
            onChange={set("priority")}
            options={["normal", "important", "urgent"].map((p) => ({ value: p, label: t(`erp.tasks.priority.${p}`) }))}
          />
        </div>
        {canEdit && task.project && <DependencyPicker value={form.dependsOn} onChange={set("dependsOn")} projectId={task.project.id} excludeId={task.id} />}
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <Link href={`/dashboard/tasks?task=${task.id}`} className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white">
          <ExternalLink size={14} /> {t("erp.gantt.openTask")}
        </Link>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          {canEdit && (
            <Button type="submit" loading={busy}>
              {t("common.save")}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

function MilestoneForm({ projectId, milestone, readOnly, onSave, onCancel, onDelete }) {
  const { t, lang } = useLanguage();
  // Lazy initial state: a new milestone defaults to a week from now.
  const [form, setForm] = useState(() => ({
    name: milestone?.name || "",
    date: toLocalInput(milestone?.date || new Date(Date.now() + 7 * DAY)),
    dependsOn: milestone?.dependsOn || [],
    done: Boolean(milestone?.doneAt),
  }));
  const [busy, setBusy] = useState(false);
  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    await onSave({ name: form.name, date: new Date(form.date).toISOString(), dependsOn: form.dependsOn, done: form.done });
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={readOnly} className="space-y-4 disabled:opacity-60">
        <Input label={t("erp.gantt.milestoneName")} value={form.name} onChange={set("name")} placeholder={t("erp.gantt.milestonePlaceholder")} required />
        <Input type="datetime-local" label={t("erp.gantt.milestoneDate")} value={form.date} onChange={set("date")} required />
        {!readOnly && <DependencyPicker value={form.dependsOn} onChange={set("dependsOn")} projectId={projectId} />}
        <p className="text-xs text-white/45">{t("erp.gantt.milestoneDepsHint")}</p>
        <Toggle checked={form.done} onChange={set("done")} label={t("erp.gantt.milestoneReached")} />
        {milestone?.baselineDate && (
          <p className="text-xs text-white/45">
            {t("erp.gantt.baseline")}: {formatDateTime(milestone.baselineDate, lang)}
          </p>
        )}
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        {milestone && !readOnly ? (
          <button type="button" onClick={onDelete} className="inline-flex items-center gap-1.5 text-sm text-red-300 hover:text-red-200">
            <Trash2 size={14} /> {t("common.delete")}
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          {!readOnly && (
            <Button type="submit" loading={busy} disabled={!form.name.trim()}>
              {t("common.save")}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
