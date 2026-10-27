"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, ChevronsDownUp, ChevronsUpDown, Crosshair, Download, ExternalLink, FileSpreadsheet, FileText, Flag, Sparkles } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { locale } from "@/lib/formatTime";
import {
  addWorkHours,
  BAR_ICON,
  BAR_STATES,
  barState,
  canMoveTask,
  criticalPath,
  dateHours,
  DAY,
  heldSpan,
  HOUR,
  nextWorkMoment,
  officeDate,
  placeTask,
  prevWorkEnd,
  taskSpan,
  overlapping,
  takesTime,
  workload,
  workMsBetween,
  workWindows,
} from "@/lib/gantt";
import Modal from "@/components/erp/ui/Modal";
import { Button, ErrorText, Input, Select, Toggle } from "@/components/erp/ui/fields";
import { SkeletonList } from "@/components/erp/ui/Loading";
import { DependencyPicker } from "@/components/erp/tasks/TaskPlanning";
import { taskHeading } from "@/components/erp/tasks/TaskRow";
import { revisionLabel, toLocalInput, useNow } from "@/components/erp/tasks/taskUi";
import { useTaskLookups } from "@/components/erp/tasks/useTaskLookups";

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

// The only three bar colours: done (accepted), scheduled, rejected.
const BAR_STYLE = {
  done: "border-emerald-400/60 bg-emerald-500/80 text-white",
  scheduled: "border-blue-400/60 bg-blue-500/80 text-white",
  ongoing: "border-orange-400/60 bg-orange-500/80 text-white",
  rejected: "border-red-400/60 bg-red-500/80 text-white",
};

const FINISHED = ["approved", "done", "cancelled"];

const startOfDay = (ms) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
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

export default function ProjectsTimeline({ projects, status }) {
  const { t, lang } = useLanguage();
  const [data, setData] = useState(null);
  const [zoom, setZoom] = useState("day");
  const [groupBy, setGroupBy] = useState("project");
  const [opts, setOpts] = useState({ workdays: true, autoShift: true, critical: true });
  const [collapsed, setCollapsed] = useState({});
  const [drag, setDrag] = useState(null);
  const [editing, setEditing] = useState(null);
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
  const tasksById = useMemo(() => Object.fromEntries(tasks.map((x) => [x.id, x])), [tasks]);

  // Tasks on each project's critical path (dependencies and employees' queues): any
  // delay to them delays the delivery.
  const critical = useMemo(
    () =>
      cal
        ? criticalPath(
            tasks.map((x) => ({ id: x.id, span: heldSpan(x), dependsOn: (x.dependsOn || []).map((d) => d.id), assignee: x.assignee?.id, project: x.project?.id, status: x.status })),
            cal
          )
        : new Set(),
    [tasks, cal]
  );

  const load_ = useMemo(() => (cal ? workload(tasks.filter((x) => x.project && visibleIds.has(x.project.id)), cal) : {}), [tasks, cal, visibleIds]);

  // Groups (y axis): projects, or people with their tasks.
  // Saved expected deliveries per project (Baseline 1 at creation, 2, 3… from here).
  const baselinesOf = useMemo(() => Object.fromEntries((data?.projects || []).map((p) => [p.id, p.baselines || []])), [data]);
  const forecastOf = useMemo(() => Object.fromEntries((data?.projects || []).map((p) => [p.id, p.forecastEnd])), [data]);
  const forecastStartOf = useMemo(() => Object.fromEntries((data?.projects || []).map((p) => [p.id, p.forecastStart])), [data]);

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
      // Like a Gantt summary bar: from its first task's start to its last task's finish
      // (the expected delivery), so it grows when the tasks are delayed.
      const live = list.filter((x) => !["cancelled", "rejected"].includes(x.status));
      const fallback = project.startDate ? new Date(project.startDate).getTime() : new Date(project.createdAt).getTime();
      const start = live.length ? Math.min(...live.map((x) => x.span.start)) : fallback;
      const forecast = forecastOf[project.id] ? new Date(forecastOf[project.id]).getTime() : 0;
      const end = Math.max(start + HOUR, forecast, ...live.map((x) => heldSpan(x).end));
      return { id: project.id, kind: "project", project, span: { start, end }, tasks: list };
    });
  }, [tasks, projects, visibleIds, groupBy, data, forecastOf]);

  // Rows with their y position, and the visible date range.
  const layout = useMemo(() => {
    const rows = [];
    let y = 0;
    let min = now;
    let max = now;
    const extent = {};
    for (const g of groups) {
      rows.push({ kind: g.kind, group: g, y, h: GROUP_H });
      extent[g.id] = { top: y };
      y += GROUP_H;
      for (const x of g.tasks) {
        min = Math.min(min, x.span.start);
        max = Math.max(max, x.span.end);
      }
      if (g.span) {
        min = Math.min(min, g.span.start);
        max = Math.max(max, g.span.end);
      }
      for (const b of g.kind === "project" ? baselinesOf[g.id] || [] : []) {
        max = Math.max(max, new Date(b.end).getTime());
        if (b.start) min = Math.min(min, new Date(b.start).getTime());
      }
      // The client's due date marker.
      if (g.kind === "project" && g.project.dueDate) max = Math.max(max, new Date(g.project.dueDate).getTime());
      if (!collapsed[g.id]) {
        for (const task of g.tasks) {
          rows.push({ kind: "task", task, group: g, y, h: TASK_H });
          y += TASK_H;
        }
      }
      extent[g.id].bottom = y;
    }
    const from = startOfDay(min - 3 * DAY);
    const to = Math.min(startOfDay(max + 15 * DAY), from + 3 * 365 * DAY);
    return { rows, height: y, from, to, extent };
  }, [groups, collapsed, now, baselinesOf]);

  const { rows, height, from, to, extent } = layout;
  // Time ↔ pixels. Hours view: working windows side by side, nights and days off removed.
  const scale = useMemo(() => {
    if (zoom === "hour" && cal) {
      const pxMs = HOUR_PX / HOUR;
      let offset = 0;
      const segs = [];
      for (const w of workWindows(from, to, cal)) {
        const seg = { ...w, offset, w: (w.end - w.start) * pxMs };
        offset += seg.w + DAY_GAP;
        segs.push(seg);
      }
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
      const { assigneeId, ...fields } = body; // the server places a reassigned task
      setTasks((list) => list.map((x) => (x.id === task.id ? { ...x, ...fields, dependsOn: x.dependsOn } : x)));
      try {
        const res = await api(`/api/tasks/${task.id}/schedule`, { method: "PATCH", body: { ...body, cascade: opts.autoShift } });
        mergeTasks([res.task, ...res.moved]);
        if (res.moved.length) setNotice(t("erp.gantt.moved", { n: res.moved.length }));
        // Other employees' queues and the projects' expected delivery may have moved too.
        load();
        return true;
      } catch (err) {
        setTasks(() => before);
        setError(errorText(t, err));
        return false;
      }
    },
    [data, opts.autoShift, mergeTasks, setTasks, t, load]
  );

  const editable = (task) => canSchedule && canMoveTask(task);

  // How far (ms, snapped) a point at time `at` moves when dragged `dx` pixels.
  const shiftFor = (at, dx) => {
    const target = scale.invX(scale.x(at) + dx);
    return Math.round((target - at) / (snap * HOUR)) * snap * HOUR;
  };

  // New position of a dragged bar, snapped to the working calendar when it's on.
  // A bar can't be dragged into the past: its start and end stop at the next full
  // hour from now (or where they already are, if that's earlier).
  const draggedSpan = (task, mode, dx) => {
    const span = taskSpan(task);
    const shift = shiftFor(mode === "end" ? span.end : span.start, dx);
    if (!shift) return span;
    const floor = Math.ceil(now / HOUR) * HOUR;
    const start = Math.max(span.start + shift, Math.min(span.start, floor));
    const minEnd = Math.min(span.end, floor);
    if (!useCal) {
      if (mode === "move") return { ...span, start, end: start + (span.end - span.start) };
      if (mode === "start") return { ...span, start: Math.min(start, span.end - HOUR) };
      return { ...span, end: Math.max(span.end + shift, span.start + HOUR, minEnd) };
    }
    if (mode === "move") return { ...span, ...placeTask(start, workMsBetween(span.start, span.end, cal), cal) };
    if (mode === "start") return { ...span, start: Math.min(nextWorkMoment(start, cal), span.end - HOUR) };
    return { ...span, end: Math.max(prevWorkEnd(span.end + shift, cal), span.start + HOUR, minEnd) };
  };

  // The employee's other task a bar at `span` would sit on top of, or null.
  const clashFor = (task, span) => {
    if (!task.assignee || task.kind === "meeting") return null;
    const others = data.tasks.filter((o) => o.id !== task.id && o.assignee?.id === task.assignee.id && takesTime(o));
    return overlapping(span, others);
  };

  const beginDrag = (e, item, mode) => {
    if (e.button !== 0) return;
    // Links start from any task (started or finished ones too); only the task that
    // will wait must be not started. Moving and resizing need a not-started task.
    if (mode === "link" ? !canSchedule : !editable(item)) return;
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
      const task = d.item;
      if (d.mode === "link") {
        const targetId = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-task-id]")?.dataset.taskId;
        const target = tasksById[targetId];
        if (!target || target.id === task.id) return;
        // The task that waits must not have started yet.
        if (!editable(target)) {
          setNotice("");
          setError(t("erp.gantt.linkStarted", { n: target.number }));
          return;
        }
        const ids = target.dependsOn.map((x) => x.id);
        if (!ids.includes(task.id)) save(target, { dependsOn: [...ids, task.id] });
        return;
      }
      if (clicked) return setEditing(task);
      const span = draggedSpan(task, d.mode, dx);
      const orig = taskSpan(task);
      if (span.start === orig.start && span.end === orig.end) return;
      // One task at a time per employee: the bar can't be dropped on their other work.
      const clash = clashFor(task, span);
      if (clash) {
        setNotice("");
        setError(t("erp.gantt.overlap", { n: clash.number }));
        return;
      }
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
    if (!drag || drag.id !== task.id || drag.mode === "link" || Math.abs(drag.dx) <= 3) return taskSpan(task);
    return draggedSpan(task, drag.mode, drag.dx);
  };

  // Saves the project's current expected delivery as its next baseline (2, 3…).
  const saveBaseline = async (project) => {
    const n = Math.max(0, ...(baselinesOf[project.id] || []).map((b) => b.n)) + 1;
    if (!window.confirm(t("erp.gantt.saveBaselineConfirm", { n }))) return;
    setError("");
    try {
      await api(`/api/work-projects/${project.id}/baseline`, { method: "POST" });
      setNotice(t("erp.gantt.baselineSaved", { n }));
      load();
    } catch (err) {
      setError(errorText(t, err));
    }
  };

  // Moves not-started work earlier into free time (the plan never does this on its own).
  const fillFreeTime = async () => {
    if (!window.confirm(t("erp.gantt.fillFreeTimeConfirm"))) return;
    setError("");
    setNotice("");
    try {
      const res = await api("/api/work-projects/fill-free-time", { method: "POST" });
      setNotice(res.moved ? t("erp.gantt.filled", { n: res.moved }) : t("erp.gantt.filledNone"));
      load();
    } catch (err) {
      setError(errorText(t, err));
    }
  };

  // ---------- export ----------

  async function exportAs(kind) {
    setExportOpen(false);
    const { exportExcel, exportPdf } = await import("@/components/erp/projects/ganttExport");
    const model = { groups, cal, tasksById, people: data.people, load: load_, now, lang, t, from, to, opts };
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
      });
    }
  }

  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed[g.id]);
  const nowFmt = new Intl.DateTimeFormat(locale(lang), { weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...(cal?.tz ? { timeZone: cal.tz } : {}) });
  const hourLabel = (n) => t("erp.gantt.hours", { n: Math.round(n * 10) / 10 });

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
        {canSchedule && (
          <Button variant="ghost" onClick={fillFreeTime}>
            <Sparkles size={15} /> {t("erp.gantt.fillFreeTime")}
          </Button>
        )}
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
      </div>

      <p className="mb-3 text-xs text-white/45">
        {t(canSchedule ? "erp.gantt.editHint" : "erp.gantt.readOnlyHint")}
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
              <div className="pointer-events-none absolute inset-y-0 z-[1] w-0.5 bg-rose-400" style={{ left: x(now) }} />
              <div
                className="pointer-events-none absolute bottom-1 z-[2] -translate-x-1/2 whitespace-nowrap rounded-full bg-rose-400 px-2 py-0.5 text-[10px] font-semibold text-brand-navy shadow"
                style={{ left: x(now) }}
                title={t("erp.gantt.nowHint")}
              >
                {t("erp.gantt.now")} · {nowFmt.format(now)}
              </div>
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
                    <span className="min-w-0 flex-1 truncate text-white/80">{barTitle(row.task, lang)}</span>
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
                    load={row.kind === "person" ? load_[row.group.person.id] : null}
                    today={cal ? officeDate(now, cal) : ""}
                    cal={cal}
                    baselines={row.kind === "project" ? baselinesOf[row.group.id] : null}
                    forecastEnd={row.kind === "project" ? forecastOf[row.group.id] : null}
                    forecastStart={row.kind === "project" ? forecastStartOf[row.group.id] : null}
                    onSaveBaseline={canSchedule && row.kind === "project" ? () => saveBaseline(row.group.project) : null}
                  />
                )
              )}
            </div>

            {/* Chart */}
            <div ref={chartRef} className="relative" style={{ width, height }}>
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
              {/* The past is shaded: bars can't be dragged into it. */}
              <div className="pointer-events-none absolute left-0 top-0 h-full bg-black/20" style={{ width: Math.max(0, x(now)) }} />
              <div className="pointer-events-none absolute top-0 z-[5] h-full w-0.5 bg-rose-400/70" style={{ left: x(now) }} />

              {/* Baselines: the expected delivery saved when the project was created (1) and later (2, 3…). */}
              {groupBy === "project" &&
                groups.flatMap((g) =>
                  (baselinesOf[g.id] || []).map((b) => {
                    const first = b.n === 1;
                    const box = extent[g.id];
                    return (
                      <div key={`bl${g.id}-${b.n}`} className="contents">
                      {/* Baseline 1's expected start. */}
                      {first && b.start && (
                        <div className="pointer-events-none absolute z-[7]" style={{ left: x(new Date(b.start).getTime()), top: box.top, height: box.bottom - box.top }}>
                          <div className="absolute inset-y-0 -translate-x-1/2 border-s-2 border-sky-300" />
                          <span
                            className="absolute top-0.5 -translate-x-1/2 whitespace-nowrap rounded bg-sky-300 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-brand-navy"
                            title={`${t("erp.gantt.startLine")} · ${nowFmt.format(new Date(b.start))}`}
                          >
                            {t("erp.gantt.startLine")}
                          </span>
                        </div>
                      )}
                      <div className="pointer-events-none absolute z-[7]" style={{ left: x(new Date(b.end).getTime()), top: box.top, height: box.bottom - box.top }}>
                        <div className={`absolute inset-y-0 -translate-x-1/2 border-s-2 ${first ? "border-yellow-300" : "border-dashed border-orange-400"}`} />
                        <span
                          className={`absolute top-0.5 -translate-x-1/2 whitespace-nowrap rounded px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-brand-navy ${first ? "bg-yellow-300" : "bg-orange-400"}`}
                          title={`${t("erp.gantt.baseline", { n: b.n })} · ${nowFmt.format(new Date(b.end))}`}
                        >
                          {t("erp.gantt.baseline", { n: b.n })}
                        </span>
                      </div>
                      </div>
                    );
                  })
                )}

              {rows.map((row) => {
                if (row.kind === "project") {
                  const { project, span } = row.group;
                  const pct = Math.round((project.progress || 0) * 100);
                  const name = project.code || project.name?.[lang] || "";
                  const due = project.dueDate ? new Date(project.dueDate).getTime() : null;
                  return (
                    <div key={`p${project.id}`}>
                      <Link
                        href={`/dashboard/projects/${project.id}`}
                        className="absolute flex items-center overflow-hidden rounded-md border border-white/25 bg-white/10 hover:border-white/50"
                        style={{ left: x(span.start), width: Math.max(6, x(span.end) - x(span.start)), top: row.y + 12, height: GROUP_H - 24 }}
                        title={`${project.name?.[lang]} · ${pct}%`}
                      >
                        {/* Progress fills the bar from its start. */}
                        <span className="absolute inset-y-0 left-0 bg-emerald-500/35" style={{ width: `${pct}%` }} />
                        <span className="relative truncate whitespace-nowrap px-2 text-[10px] font-semibold text-white" dir="auto">
                          {name} · {pct}%
                        </span>
                      </Link>
                      {/* The client's due date, for comparison with the expected delivery. */}
                      {due && (
                        <span
                          className="pointer-events-auto absolute z-[8] w-1 -translate-x-1/2 rounded-full bg-red-400"
                          style={{ left: x(due), top: row.y + 8, height: GROUP_H - 16 }}
                          title={`${t("erp.gantt.clientDue")} · ${nowFmt.format(new Date(due))}`}
                        />
                      )}
                    </div>
                  );
                }
                if (row.kind === "person") return null;
                const { task } = row;
                const span = previewSpan(task);
                const left = x(span.start);
                const barW = Math.max(8, x(span.end) - left);
                const canEdit = editable(task);
                const clashing = drag?.id === task.id && drag.mode !== "link" && Math.abs(drag.dx) > 3 && !!clashFor(task, span);
                const state = barState(task);
                const onCritical = opts.critical && critical.has(task.id) && !FINISHED.includes(task.status);
                const label = `#${task.number} · ${barTitle(task, lang)}`;
                const badge = `${BAR_ICON[state]} ${t(`erp.plan.state.${state}`)}`;
                const top = row.y + (TASK_H - BAR_H) / 2;
                return (
                  <div key={task.id} data-task-id={task.id} className="absolute" style={{ left, top, width: barW, height: BAR_H }}>
                    <div
                      onPointerDown={(e) => beginDrag(e, task, "move")}
                      onClick={() => !canEdit && setEditing(task)}
                      title={`${label} — ${badge}${canSchedule && !canEdit ? ` · ${t("erp.plan.locked")}` : ""}`}
                      className={`relative flex h-full items-center gap-1 overflow-hidden rounded-md border text-[11px] ${BAR_STYLE[state]} ${canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${
                        drag?.id === task.id ? "z-10 shadow-lg shadow-black/40" : ""
                      } ${clashing ? "cursor-not-allowed opacity-70 ring-2 ring-red-500" : onCritical ? "ring-2 ring-rose-300" : ""}`}
                    >
                      {canEdit && <span onPointerDown={(e) => beginDrag(e, task, "start")} className="absolute inset-y-0 left-0 z-[1] w-2 cursor-ew-resize hover:bg-white/30" />}
                      <span className="relative shrink-0 ps-1.5 text-[10px]">{BAR_ICON[state]}</span>
                      {barW > 60 && <span className="relative shrink-0 rounded bg-black/20 px-1 text-[9px] font-medium uppercase tracking-wide">{t(`erp.plan.state.${state}`)}</span>}
                      <span className="relative truncate pe-2" dir="auto">
                        {barW > 140 ? label : barW > 90 ? `#${task.number}` : ""}
                      </span>
                      {canEdit && <span onPointerDown={(e) => beginDrag(e, task, "end")} className="absolute inset-y-0 right-0 z-[1] w-2 cursor-ew-resize hover:bg-white/30" />}
                    </div>
                    {canSchedule && (
                      <span
                        onPointerDown={(e) => beginDrag(e, task, "link")}
                        title={t("erp.tasks.addDependency")}
                        className="absolute -right-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 cursor-crosshair rounded-full border border-white/60 bg-brand-navy hover:scale-125 hover:bg-white/40"
                      />
                    )}
                    {task.expectedEnd && new Date(task.expectedEnd).getTime() > span.end && (
                      <span
                        className="absolute inset-y-1 left-full rounded-e-md border border-s-0 border-red-400/60 bg-[repeating-linear-gradient(135deg,rgba(248,113,113,0.55)_0_4px,transparent_4px_8px)]"
                        style={{ width: Math.max(4, x(new Date(task.expectedEnd).getTime()) - x(span.end)) }}
                        title={t("erp.gantt.overrun", { at: nowFmt.format(new Date(task.expectedEnd)) })}
                      />
                    )}
                    {task.estimatedHours > 0 && !task.expectedEnd && (
                      <span className="pointer-events-none absolute left-full top-1/2 ms-4 -translate-y-1/2 whitespace-nowrap text-[10px] text-white/40">{hourLabel(task.estimatedHours)}</span>
                    )}
                  </div>
                );
              })}

              <svg className="pointer-events-none absolute inset-0 z-[6]" width={width} height={height}>
                <defs>
                  <marker id="gantt-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M0,0 L8,4 L0,8 z" fill="rgba(255,255,255,0.55)" />
                  </marker>
                </defs>
                {arrows.map((a) => {
                  const out = a.x1 + 10;
                  const midY = a.y2 > a.y1 ? a.y2 - TASK_H / 2 : a.y2 + TASK_H / 2;
                  const d =
                    a.x2 - 10 >= out ? `M${a.x1},${a.y1} H${out} V${a.y2} H${a.x2 - 1}` : `M${a.x1},${a.y1} H${out} V${midY} H${a.x2 - 10} V${a.y2} H${a.x2 - 1}`;
                  return <path key={a.key} d={d} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={1.5} markerEnd="url(#gantt-arrow)" />;
                })}
                {drag?.mode === "link" && drag.pointer && taskRows[drag.id] && (
                  <line
                    x1={x(taskSpan(drag.item).end) + 12}
                    y1={taskRows[drag.id].y + TASK_H / 2}
                    x2={drag.pointer.x}
                    y2={drag.pointer.y}
                    stroke="rgba(255,255,255,0.7)"
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

      <Legend t={t} />

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={t("erp.gantt.editTask")}>
        {editing && (
          <ScheduleForm
            task={editing}
            canEdit={editable(editing)}
            cal={cal}
            onCancel={() => setEditing(null)}
            onSave={async (body) => (await save(editing, body)) && setEditing(null)}
          />
        )}
      </Modal>

    </div>
  );
}

// Task name on the chart; redos carry their number (R-01, R-02…).
function barTitle(task, lang) {
  return [taskHeading(task, lang), task.revision > 0 ? revisionLabel(task.revision) : ""].filter(Boolean).join(" · ");
}

function GroupLabel({ group, lang, t, collapsed, onToggle, load, today, cal, baselines, forecastEnd, forecastStart, onSaveBaseline }) {
  const isProject = group.kind === "project";
  const title = isProject ? group.project.name?.[lang] : group.person.name;
  // People: hours planned this week (next 7 office days) against capacity.
  let weekLoad = null;
  if (load) {
    const dates = Object.keys(load).filter((d) => d >= today).sort().slice(0, 6);
    const hours = dates.reduce((n, d) => n + load[d], 0);
    // Capacity is that day's working hours (or the person's own daily hours).
    weekLoad = { hours, over: dates.some((d) => load[d] > (group.person.dailyHours ?? dateHours(d, cal)) + 0.01) };
  }
  // Projects: how far the expected delivery moved from Baseline 1 (working time).
  const first = baselines?.find((b) => b.n === 1);
  const last = baselines?.length ? baselines.reduce((a, b) => (b.n > a.n ? b : a)) : null;
  let delay = null;
  if (first && forecastEnd && cal) {
    const a = new Date(first.end).getTime();
    const b = new Date(forecastEnd).getTime();
    const ms = b >= a ? workMsBetween(a, b, cal) : -workMsBetween(b, a, cal);
    const hours = Math.round((Math.abs(ms) / HOUR) * 10) / 10;
    if (Math.abs(ms) >= HOUR / 2) delay = { ms, label: `${ms > 0 ? "+" : "-"}${t("erp.gantt.hours", { n: hours })}` };
  }
  // …and how far the start moved from Baseline 1's expected start.
  let startDelay = null;
  if (first?.start && forecastStart && cal) {
    const a = new Date(first.start).getTime();
    const b = new Date(forecastStart).getTime();
    const ms = b >= a ? workMsBetween(a, b, cal) : -workMsBetween(b, a, cal);
    const hours = Math.round((Math.abs(ms) / HOUR) * 10) / 10;
    if (Math.abs(ms) >= HOUR / 2) startDelay = { ms, label: `▶${ms > 0 ? "+" : "-"}${t("erp.gantt.hours", { n: hours })}` };
  }
  const nextBaseline = (last?.n || 0) + 1;
  const moved = Boolean(last && forecastEnd && Math.abs(new Date(forecastEnd) - new Date(last.end)) >= 60000);
  return (
    <div className="group flex items-center gap-1 border-b border-white/10 bg-white/[0.04] pe-2" style={{ height: GROUP_H }}>
      <button type="button" dir="auto" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 ps-3 text-start text-sm font-semibold" style={{ height: GROUP_H }}>
        <ChevronDown size={15} className={`shrink-0 text-white/50 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {isProject && (group.project.late || group.project.dueRisk) && (
          <AlertTriangle size={13} className="shrink-0 text-red-300" title={group.project.late ? undefined : t("erp.gantt.dueRisk")} />
        )}
        {weekLoad && (
          <span className={`shrink-0 text-[11px] font-normal ${weekLoad.over ? "text-red-300" : "text-white/45"}`} title={t("erp.gantt.weekLoad")}>
            {weekLoad.over && <AlertTriangle size={11} className="me-0.5 inline" />}
            {t("erp.gantt.hours", { n: Math.round(weekLoad.hours) })}
          </span>
        )}
        {startDelay && (
          <span className={`shrink-0 text-[11px] font-medium ${startDelay.ms > 0 ? "text-red-300" : "text-emerald-300"}`} title={t("erp.gantt.startVsBaseline1")} dir="ltr">
            {startDelay.label}
          </span>
        )}
        {delay && (
          <span className={`shrink-0 text-[11px] font-medium ${delay.ms > 0 ? "text-red-300" : "text-emerald-300"}`} title={t("erp.gantt.vsBaseline1")} dir="ltr">
            {delay.label}
          </span>
        )}
        <span className="shrink-0 text-[11px] font-normal text-white/40">{group.tasks.length}</span>
      </button>
      {onSaveBaseline && (
        <button
          type="button"
          onClick={onSaveBaseline}
          title={t("erp.gantt.saveBaseline", { n: nextBaseline })}
          // Highlighted while the expected delivery has moved since the last baseline.
          className={`flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-1 text-[10px] font-semibold ${moved ? "bg-orange-400/20 text-orange-300 hover:bg-orange-400/30" : "text-white/35 hover:bg-white/10 hover:text-white"}`}
        >
          <Flag size={11} /> {nextBaseline}
        </button>
      )}
    </div>
  );
}

// What the three bar colours mean.
function Legend({ t }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/60">
      {BAR_STATES.map((state) => (
        <span key={state} className="flex items-center gap-2">
          <span className={`flex h-4 items-center gap-1 rounded-sm border px-1.5 text-[9px] font-medium uppercase ${BAR_STYLE[state]}`}>
            {BAR_ICON[state]} {t(`erp.plan.state.${state}`)}
          </span>
          {t(`erp.plan.legend.${state}`)}
        </span>
      ))}
      <span className="flex items-center gap-2">
        <span className="h-4 border-s-2 border-sky-300" /> {t("erp.gantt.startLine")}
      </span>
      <span className="flex items-center gap-2">
        <span className="h-4 border-s-2 border-yellow-300" /> {t("erp.gantt.baseline", { n: 1 })}
      </span>
      <span className="flex items-center gap-2">
        <span className="h-4 w-1 rounded-full bg-red-400" /> {t("erp.gantt.clientDue")}
      </span>
      <span className="flex items-center gap-2">
        <span className="h-4 border-s-2 border-dashed border-orange-400" /> {t("erp.gantt.baseline", { n: "2+" })}
      </span>
      <span className="flex items-center gap-2">
        <span className="h-4 border-s-2 border-rose-400" /> {t("erp.gantt.now")}
      </span>
      <span className="flex items-center gap-2">
        <span className="h-3 w-6 rounded-sm bg-blue-500/80 ring-2 ring-rose-300" /> {t("erp.gantt.criticalLegend")}
      </span>
      <span className="flex items-center gap-2">
        <span className="h-3 w-6 rounded-sm border border-red-400/60 bg-[repeating-linear-gradient(135deg,rgba(248,113,113,0.55)_0_4px,transparent_4px_8px)]" />
        {t("erp.gantt.overrunLegend")}
      </span>
    </div>
  );
}

// Edit a task from the chart. Start, due time and working hours move together (the
// hours are the working time between them), and a new employee without new times puts
// the task in their first free time. Only what changed is sent.
function ScheduleForm({ task, canEdit, cal, onSave, onCancel }) {
  const { t, lang } = useLanguage();
  const lookups = useTaskLookups();
  const span = taskSpan(task);
  const hoursOf = (a, b) => (cal ? Math.max(0.5, Math.round((workMsBetween(a, b, cal) / HOUR) * 2) / 2) : task.estimatedHours || 0);
  const [init] = useState(() => ({
    plannedStart: toLocalInput(new Date(span.start)),
    dueAt: toLocalInput(new Date(span.end)),
    hours: String(task.maxHours || task.estimatedHours || hoursOf(span.start, span.end)),
    assigneeId: task.assignee?.id || "",
    priority: task.priority,
    dependsOn: (task.dependsOn || []).map((d) => d.id),
  }));
  const [form, setForm] = useState(init);
  const [busy, setBusy] = useState(false);
  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));
  const ms = (v) => (v ? new Date(v).getTime() : null);
  const dueFor = (start, hours) => (cal && start && Number(hours) > 0 ? toLocalInput(new Date(addWorkHours(nextWorkMoment(ms(start), cal), Number(hours), cal))) : null);

  // A new start keeps the hours (the due time follows); a new due time changes the hours;
  // new hours move the due time.
  const setStart = (plannedStart) => setForm((f) => ({ ...f, plannedStart, dueAt: dueFor(plannedStart, f.hours) ?? f.dueAt }));
  const setDue = (dueAt) => setForm((f) => ({ ...f, dueAt, hours: cal && ms(dueAt) > ms(f.plannedStart) ? String(hoursOf(ms(f.plannedStart), ms(dueAt))) : f.hours }));
  const setHours = (hours) => setForm((f) => ({ ...f, hours, dueAt: dueFor(f.plannedStart, hours) ?? f.dueAt }));

  const timeChanged = form.plannedStart !== init.plannedStart || form.dueAt !== init.dueAt;
  const reassigned = Boolean(form.assigneeId) && form.assigneeId !== init.assigneeId;
  const people = [...lookups.people]
    .sort((a, b) => (a.department === task.department ? 0 : 1) - (b.department === task.department ? 0 : 1) || a.name.localeCompare(b.name))
    .map((p) => ({ value: p.id, label: p.name }));

  const submit = async (e) => {
    e.preventDefault();
    const body = {};
    if (timeChanged) {
      body.plannedStart = form.plannedStart ? new Date(form.plannedStart).toISOString() : null;
      body.dueAt = form.dueAt ? new Date(form.dueAt).toISOString() : null;
    } else if (form.hours !== init.hours) body.estimatedHours = Number(form.hours) || 0;
    if (reassigned) body.assigneeId = form.assigneeId;
    if (form.priority !== init.priority) body.priority = form.priority;
    if (form.dependsOn.join() !== init.dependsOn.join()) body.dependsOn = form.dependsOn;
    if (!Object.keys(body).length) return onCancel();
    setBusy(true);
    await onSave(body);
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
      </div>
      <fieldset disabled={!canEdit} className="space-y-4 disabled:opacity-60">
        <div>
          <Select
            label={t("erp.tasks.assignee")}
            value={form.assigneeId}
            onChange={set("assigneeId")}
            options={people.length ? people : [{ value: init.assigneeId, label: task.assignee?.name || "—" }]}
          />
          {reassigned && <p className="mt-1.5 text-xs text-sky-200">{t(timeChanged ? "erp.gantt.reassignKeepTime" : "erp.gantt.reassignAuto")}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input type="datetime-local" label={t("erp.gantt.start")} value={form.plannedStart} onChange={setStart} />
          <Input type="datetime-local" label={t("erp.gantt.due")} value={form.dueAt} onChange={setDue} />
          <Input type="number" min="0.5" max="1000" step="0.5" label={t("erp.plan.hours")} value={form.hours} onChange={setHours} dir="ltr" />
        </div>
        <Select
          label={t("erp.tasks.priorityLabel")}
          value={form.priority}
          onChange={set("priority")}
          options={["normal", "important", "urgent"].map((p) => ({ value: p, label: t(`erp.tasks.priority.${p}`) }))}
        />
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
