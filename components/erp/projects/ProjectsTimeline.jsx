"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Ban, Building2, ChevronDown, Diamond, GripVertical, ChevronsDownUp, ChevronsUpDown, Crosshair, Download, ExternalLink, FileSpreadsheet, FileText, Flag, Plus, SlidersHorizontal, Sparkles, UserCheck } from "lucide-react";
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
  externalSpan,
  heldSpan,
  HOLDING_STATUSES,
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
import Avatar from "@/components/erp/ui/Avatar";
import Modal from "@/components/erp/ui/Modal";
import { Button, ErrorText, Input, Select, Toggle } from "@/components/erp/ui/fields";
import { SkeletonList } from "@/components/erp/ui/Loading";
import { DependencyPicker } from "@/components/erp/tasks/TaskPlanning";
import TaskCancel from "@/components/erp/tasks/TaskCancel";
import TaskForm from "@/components/erp/tasks/TaskForm";
import { taskHeading } from "@/components/erp/tasks/TaskRow";
import { revisionLabel, toLocalInput, useNow } from "@/components/erp/tasks/taskUi";
import { useTaskLookups } from "@/components/erp/tasks/useTaskLookups";
import TraineeBadge from "@/components/erp/ui/TraineeBadge";
import { ExternalHoursField, ExternalReviewBox } from "@/components/erp/tasks/ExternalReview";
import ProjectMilestones from "@/components/erp/projects/ProjectMilestones";
import { evmTone } from "@/lib/evm";

// The task-name column: narrower on phones so the chart keeps most of the screen.
const LABEL_W = 270;
const LABEL_W_PHONE = 150;
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

// Bar colours by state (lib/gantt barState). Cancelled bars stay, greyed and struck through.
const BAR_STYLE = {
  done: "border-emerald-400/60 bg-emerald-500/80 text-white",
  scheduled: "border-blue-400/60 bg-blue-500/80 text-white",
  ongoing: "border-orange-400/60 bg-orange-500/80 text-white",
  rejected: "border-red-400/60 bg-red-500/80 text-white",
  cancelled: "border-slate-400/40 bg-slate-500/35 text-white/60 line-through",
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

export default function ProjectsTimeline({ projects, status, leading = null }) {
  const { t, lang } = useLanguage();
  const [data, setData] = useState(null);
  const [zoom, setZoom] = useState("day");
  const [groupBy, setGroupBy] = useState("project");
  const [opts, setOpts] = useState({ workdays: true, autoShift: true, critical: true, cancelled: true });
  const [collapsed, setCollapsed] = useState({});
  const [drag, setDrag] = useState(null);
  const [editing, setEditing] = useState(null);
  // The project whose milestones (and billing) are open.
  const [milestonesFor, setMilestonesFor] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showCancels, setShowCancels] = useState(false);
  const [assignFor, setAssignFor] = useState(null); // an employee with free time
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const scrollRef = useRef(null);
  const chartRef = useRef(null);
  const scrolledFor = useRef("");
  const now = useNow(true, 60000);
  const [labelW, setLabelW] = useState(LABEL_W);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const apply = () => setLabelW(media.matches ? LABEL_W_PHONE : LABEL_W);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

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
  // Everything that takes the employees' time: the chart's tasks and their other work
  // that isn't on it (no project, meetings, projects in another status).
  const allWork = useMemo(() => [...tasks, ...(data?.busy || [])], [tasks, data]);
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
  const evmOf = useMemo(() => Object.fromEntries((data?.projects || []).map((p) => [p.id, p.evm || null])), [data]);
  const milestonesOf = useMemo(() => Object.fromEntries((data?.projects || []).map((p) => [p.id, p.milestones || []])), [data]);
  // The CEO's priority order (dragged on the chart): 0 = top. Unranked projects follow.
  const rankOf = useMemo(() => Object.fromEntries((data?.projects || []).map((p) => [p.id, p.rank ?? Infinity])), [data]);

  const groups = useMemo(() => {
    const visible = tasks
      .filter((x) => x.project && visibleIds.has(x.project.id) && (opts.cancelled || x.status !== "cancelled"))
      .map((x) => ({ ...x, span: taskSpan(x) }));
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
    // A department manager only gets their department's tasks: other projects are hidden.
    const shown = (data?.departmentOnly ? projects.filter((p) => byProject[p.id]) : projects)
      .map((p, i) => ({ p, i }))
      .sort((a, b) => (rankOf[a.p.id] ?? Infinity) - (rankOf[b.p.id] ?? Infinity) || a.i - b.i)
      .map(({ p }) => p);
    return shown.map((project) => {
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
  }, [tasks, projects, visibleIds, groupBy, data, forecastOf, rankOf, opts.cancelled]);

  // ---------- ranking the projects (CEO): drag a project's header up or down ----------
  const [rankDrag, setRankDrag] = useState(null); // the dragged project's id
  const [rankDrop, setRankDrop] = useState(null); // { id, after } — where it would land
  const canRank = canSchedule && groupBy === "project";
  async function dropRank(targetId, after) {
    const from = rankDrag;
    setRankDrag(null);
    setRankDrop(null);
    if (!from || from === targetId) return;
    const order = groups.filter((g) => g.kind === "project").map((g) => g.id).filter((id) => id !== from);
    order.splice(order.indexOf(targetId) + (after ? 1 : 0), 0, from);
    // Shown at once; saved in the background.
    const ranks = Object.fromEntries(order.map((id, i) => [id, i]));
    setData((d) => ({ ...d, projects: d.projects.map((p) => (p.id in ranks ? { ...p, rank: ranks[p.id] } : p)) }));
    try {
      await api("/api/work-projects/rank", { method: "PUT", body: { ids: order } });
    } catch (err) {
      setError(errorText(t, err));
      load();
    }
  }
  const rankHandlers = (id) =>
    canRank && {
      draggable: true,
      onDragStart: (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", id);
        setRankDrag(id);
      },
      onDragOver: (e) => {
        if (!rankDrag) return;
        e.preventDefault();
        const box = e.currentTarget.getBoundingClientRect();
        const after = e.clientY > box.top + box.height / 2;
        setRankDrop((x) => (x?.id === id && x.after === after ? x : { id, after }));
      },
      onDrop: (e) => {
        e.preventDefault();
        if (rankDrop) dropRank(rankDrop.id, rankDrop.after);
      },
      onDragEnd: () => {
        setRankDrag(null);
        setRankDrop(null);
      },
      indicator: rankDrop?.id === id && rankDrag !== id ? (rankDrop.after ? "after" : "before") : null,
      dragging: rankDrag === id,
    };

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

  // Employees' free time on the chart. By person: on their row. By project: on the row
  // of their task that waits after the gap (else the one before it), where the empty
  // stretch shows.
  const freeBlocks = useMemo(() => {
    const out = [];
    const MIN = 60000;
    for (const person of data?.freeTime || []) {
      const mine = rows.filter((r) => r.kind === "task" && r.task.assignee?.id === person.id && r.task.status !== "cancelled");
      const personRow = rows.find((r) => r.kind === "person" && r.group.person.id === person.id);
      for (const gap of person.gaps) {
        let row = personRow;
        if (!row) {
          const after = mine.filter((r) => r.task.span.start >= gap.end - MIN).sort((a, b) => a.task.span.start - b.task.span.start)[0];
          const before = mine.filter((r) => r.task.span.end <= gap.start + MIN).sort((a, b) => b.task.span.end - a.task.span.end)[0];
          row = after || before;
        }
        if (row) out.push({ key: `${person.id}-${gap.start}`, person, gap, row });
      }
    }
    return out;
  }, [data, rows]);

  // The employees' work that has no bar on the chart (another project, no project, a
  // meeting, a collapsed group): it still takes their time, so it shows hatched on their
  // rows — a bar can't be dropped there.
  const busyBlocks = useMemo(() => {
    const shown = new Set(rows.filter((r) => r.kind === "task").map((r) => r.task.id));
    const hidden = allWork.filter((o) => o.assignee && !shown.has(o.id) && takesTime(o));
    const out = [];
    if (!hidden.length) return out;
    for (const row of rows) {
      const who = row.kind === "task" ? row.task.assignee?.id : row.kind === "person" ? row.group.person.id : null;
      if (!who) continue;
      for (const o of hidden) if (o.assignee.id === who) out.push({ key: `${row.y}-${o.id}`, row, task: o, span: heldSpan(o) });
    }
    return out;
  }, [rows, allWork]);

  // "The employee has task #n (title) at that time".
  const overlapText = useCallback(
    (n) => {
      const o = allWork.find((w) => w.number === n);
      return t("erp.gantt.overlap", { n, title: o ? barTitle(o, lang) : "—" });
    },
    [allWork, t, lang]
  );

  const scrollTo = (ms) => {
    if (scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, x(ms) - 160);
  };

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
        setError(err.message === "schedule_overlap" && err.data?.number ? overlapText(err.data.number) : errorText(t, err));
        return false;
      }
    },
    [data, opts.autoShift, mergeTasks, setTasks, t, load, overlapText]
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
    const others = allWork.filter((o) => o.id !== task.id && o.assignee?.id === task.assignee.id && takesTime(o));
    return overlapping(span, others);
  };

  const beginDrag = (e, item, mode) => {
    if (e.button !== 0) return;
    // Links start from any task (started or finished ones too); only the task that
    // will wait must be not started. Moving and resizing need a not-started task.
    if (mode === "link" ? !canSchedule : !editable(item)) return;
    e.preventDefault();
    e.stopPropagation();
    // The chart's scroll at the start: the drag distance counts the scrolling too.
    setDrag({ id: item.id, item, mode, startX: e.clientX, startScroll: scrollRef.current?.scrollLeft || 0, dx: 0, pointer: null });
  };

  useEffect(() => {
    if (!drag) return undefined;
    const box = scrollRef.current;
    // How far the bar moved: the pointer, plus however far the chart scrolled under it.
    const distance = (clientX, d) => clientX - d.startX + ((box?.scrollLeft || 0) - d.startScroll);
    let lastX = drag.startX;
    let lastY = 0;
    const follow = (clientX, clientY) => {
      const rect = chartRef.current?.getBoundingClientRect();
      setDrag((d) => d && { ...d, dx: distance(clientX, d), pointer: rect ? { x: clientX - rect.left, y: clientY - rect.top } : null });
    };
    const onMove = (e) => {
      lastX = e.clientX;
      lastY = e.clientY;
      follow(e.clientX, e.clientY);
    };
    // Near the chart's left or right edge it scrolls along with the drag, faster the
    // closer the pointer is to the edge (or past it).
    const EDGE = 70;
    const MAX_SPEED = 28;
    let frame = requestAnimationFrame(function step() {
      if (box) {
        const { left, right } = box.getBoundingClientRect();
        const speed =
          lastX < left + EDGE ? -Math.min(MAX_SPEED, ((left + EDGE - lastX) / EDGE) * MAX_SPEED) : lastX > right - EDGE ? Math.min(MAX_SPEED, ((lastX - (right - EDGE)) / EDGE) * MAX_SPEED) : 0;
        if (speed) {
          const before = box.scrollLeft;
          box.scrollLeft = before + speed;
          if (box.scrollLeft !== before) follow(lastX, lastY);
        }
      }
      frame = requestAnimationFrame(step);
    });
    const onUp = (e) => {
      const d = drag;
      setDrag(null);
      const dx = distance(e.clientX, d);
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
        setError(overlapText(clash.number));
        return;
      }
      save(task, { plannedStart: new Date(span.start).toISOString(), dueAt: new Date(span.end).toISOString() });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      cancelAnimationFrame(frame);
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

  // A task's external review on the chart (another office checks it after delivery):
  // { start, end, late, received } or null. Not handed in yet: it follows the bar (also
  // while it's dragged).
  const externalOf = (task, span) => {
    if (!(task.externalReview?.hours > 0) || task.status === "cancelled") return null;
    if (HOLDING_STATUSES.includes(task.status)) {
      const end = cal ? addWorkHours(span.end, task.externalReview.hours, cal) : span.end + task.externalReview.hours * HOUR;
      return { start: span.end, end, late: false, received: null };
    }
    return externalSpan(task, cal, now);
  };

  const arrows = [];
  for (const row of Object.values(taskRows)) {
    for (const dep of row.task.dependsOn || []) {
      const fromRow = taskRows[dep.id];
      if (!fromRow) continue;
      const a = previewSpan(fromRow.task);
      const b = previewSpan(row.task);
      // From where the work is ready: after its external review, if it has one.
      const ext = externalOf(fromRow.task, a);
      arrows.push({
        key: `${dep.id}-${row.task.id}`,
        x1: x(ext ? ext.end : a.end),
        y1: fromRow.y + TASK_H / 2,
        x2: x(b.start),
        y2: row.y + TASK_H / 2,
      });
    }
  }

  // Employees' requests to cancel project work, waiting for the GM / CEO.
  const cancelRequests = tasks.filter((x) => x.cancelRequest?.status === "pending" && x.status !== "cancelled" && x.project && visibleIds.has(x.project.id));

  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed[g.id]);
  const nowFmt = new Intl.DateTimeFormat(locale(lang), { weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...(cal?.tz ? { timeZone: cal.tz } : {}) });
  // How many options behind "Filters" differ from their defaults — shown as a badge.
  const hiddenChanges = (groupBy !== "project") + (zoom !== "day") + !opts.workdays + (canSchedule && !opts.autoShift) + !opts.critical + !opts.cancelled;
  const hourLabel = (n) => t("erp.gantt.hours", { n: Math.round(n * 10) / 10 });

  if (!data) {
    return (
      <div>
        {leading && <div className="mb-3 flex flex-wrap items-center gap-2">{leading}</div>}
        {error ? <ErrorText>{error}</ErrorText> : <SkeletonList rows={6} />}
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar: one line; everything else sits behind "Filters" so the chart gets the room. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {leading}
        <Button variant="ghost" onClick={scrollToToday}>
          <Crosshair size={15} /> {t("erp.gantt.today")}
        </Button>
        <Button variant="ghost" onClick={() => setShowFilters((o) => !o)}>
          <SlidersHorizontal size={15} />
          {t(showFilters ? "erp.gantt.hideFilters" : "erp.gantt.moreFilters")}
          {hiddenChanges > 0 && (
            <span className="rounded-full bg-brand-orange px-1.5 text-[11px] leading-4 text-white">{hiddenChanges}</span>
          )}
          <ChevronDown size={14} className={`transition-transform ${showFilters ? "rotate-180" : ""}`} />
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

      {showFilters && (
      <div className="mb-3 space-y-2.5 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-center gap-2">
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
        <Button variant="ghost" onClick={() => setCollapsed(allCollapsed ? {} : Object.fromEntries(groups.map((g) => [g.id, true])))}>
          {allCollapsed ? <ChevronsUpDown size={15} /> : <ChevronsDownUp size={15} />}
          {t(allCollapsed ? "erp.gantt.expandAll" : "erp.gantt.collapseAll")}
        </Button>
        {canSchedule && (
          <Button variant="ghost" onClick={fillFreeTime}>
            <Sparkles size={15} /> {t("erp.gantt.fillFreeTime")}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-sm">
        <Toggle checked={opts.workdays} onChange={setOpt("workdays")} label={t("erp.gantt.workdays")} />
        {canSchedule && <Toggle checked={opts.autoShift} onChange={setOpt("autoShift")} label={t("erp.gantt.autoShift")} />}
        <Toggle checked={opts.critical} onChange={setOpt("critical")} label={t("erp.gantt.critical")} />
        <Toggle checked={opts.cancelled} onChange={setOpt("cancelled")} label={t("erp.gantt.showCancelled")} />
      </div>

      <p className="px-1 text-xs text-white/45">
        {t(canSchedule ? "erp.gantt.editHint" : "erp.gantt.readOnlyHint")}
      </p>
      </div>
      )}

      {canSchedule && cancelRequests.length > 0 && (
        <div className="mb-3 rounded-xl border border-amber-400/40 bg-amber-500/[0.07]">
          <button type="button" onClick={() => setShowCancels((o) => !o)} className="flex w-full items-center gap-2 px-4 py-2.5 text-start text-sm font-semibold text-amber-100">
            <Ban size={15} /> {t("erp.gantt.cancelRequests", { n: cancelRequests.length })}
            <ChevronDown size={14} className={`ms-auto text-white/50 transition-transform ${showCancels ? "" : "-rotate-90"}`} />
          </button>
          {showCancels && (
          <div className="flex flex-wrap gap-1.5 px-4 pb-2.5">
            {cancelRequests.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => setEditing(task)}
                className="rounded-md border border-amber-400/30 bg-white/5 px-2 py-1 text-xs text-white/80 hover:border-amber-300 hover:text-white"
                dir="auto"
                title={task.cancelRequest.reason}
              >
                #{task.number} · {barTitle(task, lang)} · {task.cancelRequest.by?.name}
              </button>
            ))}
          </div>
          )}
        </div>
      )}

      {canSchedule && data.freeTime?.length > 0 && (
        <FreeTimePanel people={data.freeTime} now={now} cal={cal} lang={lang} t={t} onAssign={setAssignFor} onShow={scrollTo} />
      )}

      {notice && <p className="mb-3 rounded-xl bg-sky-500/10 px-4 py-2 text-sm text-sky-200">{notice}</p>}
      {error && (
        <div className="mb-3">
          <ErrorText>{error}</ErrorText>
        </div>
      )}

      <div ref={scrollRef} dir="ltr" className={`relative max-h-[72vh] overflow-auto rounded-2xl border border-white/10 bg-white/[0.02] ${drag ? "select-none" : ""}`}>
        <div style={{ width: labelW + width }}>
          {/* Header: time scale */}
          <div className="sticky top-0 z-20 flex border-b border-white/10 bg-brand-navy" style={{ height: HEADER_H }}>
            <div className="sticky left-0 z-10 shrink-0 border-e border-white/10 bg-brand-navy" style={{ width: labelW }} />
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
            <div className="sticky left-0 z-10 shrink-0 border-e border-white/10 bg-brand-navy" style={{ width: labelW }}>
              {rows.map((row) =>
                row.kind === "task" ? (
                  <div
                    key={row.task.id}
                    dir="rtl"
                    className="flex items-center gap-2 border-b border-white/5 pe-3 ps-8 text-xs"
                    style={{ height: TASK_H }}
                    title={taskHeading(row.task, lang)}
                  >
                    <span className="shrink-0 text-white/35" dir="ltr">
                      #{row.task.number}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-white/80">{barTitle(row.task, lang)}</span>
                    <span className="hidden max-w-[80px] shrink-0 truncate text-white/40 sm:inline">
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
                    onSaveBaseline={canSchedule && row.kind === "project" ? () => saveBaseline(row.group.project) : null}
                    milestones={row.kind === "project" ? milestonesOf[row.group.id] : null}
                    evm={row.kind === "project" ? evmOf[row.group.id] : null}
                    onMilestones={canSchedule && row.kind === "project" ? () => setMilestonesFor(row.group.project) : null}
                    rank={row.kind === "project" ? rankHandlers(row.group.id) : null}
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

              {/* Free time: nothing planned for the employee — a place to give them work. */}
              {freeBlocks.map(({ key, person, gap, row }) => {
                const left = x(gap.start);
                const w = Math.max(6, x(gap.end) - left);
                const h = hourLabel(gap.ms / HOUR);
                return (
                  <button
                    key={`f${key}`}
                    type="button"
                    onClick={() => setAssignFor(person)}
                    title={t("erp.gantt.freeHint", { name: person.name, from: nowFmt.format(gap.start), to: nowFmt.format(gap.end), h })}
                    className="absolute z-[4] flex items-center justify-center overflow-hidden rounded-md border border-dashed border-emerald-400/70 bg-[repeating-linear-gradient(135deg,rgba(52,211,153,0.18)_0_6px,transparent_6px_12px)] text-[10px] font-semibold text-emerald-200 hover:border-emerald-300 hover:bg-emerald-500/20"
                    style={{ left, width: w, top: row.y + 5, height: row.h - 10 }}
                  >
                    {w > 90 && (
                      <span className="flex items-center gap-1 whitespace-nowrap rounded bg-brand-navy/70 px-1.5 py-px" dir="rtl">
                        <UserCheck size={11} /> {t("erp.gantt.freeBlock")} · {h}
                      </span>
                    )}
                  </button>
                );
              })}

              {/* The employee's other work that has no bar here: their time is taken. */}
              {busyBlocks.map(({ key, row, task: o, span }) => {
                const left = x(span.start);
                const w = Math.max(4, x(span.end) - left);
                const where = o.project ? o.project.code || o.project.name?.[lang] : "";
                return (
                  <div
                    key={`b${key}`}
                    title={`${t("erp.gantt.busyBlock")} · #${o.number} · ${barTitle(o, lang)}${where ? ` · ${where}` : ""} · ${nowFmt.format(span.start)} → ${nowFmt.format(span.end)}`}
                    className="absolute z-[3] flex items-center overflow-hidden rounded-md border border-dashed border-slate-300/50 bg-[repeating-linear-gradient(135deg,rgba(148,163,184,0.22)_0_6px,transparent_6px_12px)] text-[10px] font-semibold text-slate-200"
                    style={{ left, width: w, top: row.y + 5, height: row.h - 10 }}
                  >
                    {w > 60 && (
                      <span className="truncate whitespace-nowrap px-1.5" dir="rtl">
                        #{o.number} · {t("erp.gantt.busyBlock")}
                      </span>
                    )}
                  </div>
                );
              })}

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
                        <span className="relative truncate whitespace-nowrap px-2 text-[10px] font-semibold text-white" dir="rtl">
                          {name} · {pct}%
                        </span>
                      </Link>
                      {/* Milestones: reached green, past their date red, otherwise yellow. */}
                      {(milestonesOf[project.id] || []).map((m) => {
                        const at = new Date(m.date).getTime();
                        const tone = m.doneAt ? "bg-emerald-400" : at < now ? "bg-red-400" : "bg-yellow-300";
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => canSchedule && setMilestonesFor(project)}
                            className={`absolute z-[9] h-3 w-3 -translate-x-1/2 rotate-45 border border-black/30 ${tone}`}
                            style={{ left: x(at), top: row.y + GROUP_H / 2 - 6 }}
                            title={`◆ ${m.name} · ${nowFmt.format(new Date(at))}${m.billPercent > 0 || m.billAmount > 0 ? ` · ${t("erp.milestones.billed")}` : ""}`}
                            aria-label={m.name}
                          />
                        );
                      })}
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
                const cancelAsked = task.cancelRequest?.status === "pending" && state !== "cancelled";
                const badge = `${BAR_ICON[state]} ${t(`erp.plan.state.${state}`)}${cancelAsked ? ` · ⊘ ${t("erp.gantt.cancelRequested")}` : ""}${
                  state === "cancelled" && task.cancelReason ? ` · ${task.cancelReason}` : ""
                }`;
                const top = row.y + (TASK_H - BAR_H) / 2;
                return (
                  <div key={task.id} data-task-id={task.id} className="absolute" style={{ left, top, width: barW, height: BAR_H }}>
                    <div
                      onPointerDown={(e) => beginDrag(e, task, "move")}
                      onClick={() => !canEdit && setEditing(task)}
                      title={`${label} — ${badge}${canSchedule && !canEdit ? ` · ${t("erp.plan.locked")}` : ""}`}
                      className={`relative flex h-full items-center gap-1 overflow-hidden rounded-md border text-[11px] ${BAR_STYLE[state]} ${canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${
                        drag?.id === task.id ? "z-10 shadow-lg shadow-black/40" : ""
                      } ${clashing ? "cursor-not-allowed opacity-70 ring-2 ring-red-500" : onCritical ? "ring-2 ring-rose-300" : ""} ${
                        cancelAsked ? "outline-dashed outline-2 outline-offset-1 outline-amber-300" : ""
                      }`}
                    >
                      {canEdit && <span onPointerDown={(e) => beginDrag(e, task, "start")} className="absolute inset-y-0 left-0 z-[1] w-2 cursor-ew-resize hover:bg-white/30" />}
                      <span className="relative shrink-0 ps-1.5 text-[10px]">{BAR_ICON[state]}</span>
                      {barW > 60 && <span className="relative shrink-0 rounded bg-black/20 px-1 text-[9px] font-medium uppercase tracking-wide">{t(`erp.plan.state.${state}`)}</span>}
                      <span className="relative truncate pe-2" dir="rtl">
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
                    {task.expectedEnd && HOLDING_STATUSES.includes(task.status) && new Date(task.expectedEnd).getTime() > span.end && (
                      <span
                        className="absolute inset-y-1 left-full rounded-e-md border border-s-0 border-red-400/60 bg-[repeating-linear-gradient(135deg,rgba(248,113,113,0.55)_0_4px,transparent_4px_8px)]"
                        style={{ width: Math.max(4, x(new Date(task.expectedEnd).getTime()) - x(span.end)) }}
                        title={t("erp.gantt.overrun", { at: nowFmt.format(new Date(task.expectedEnd)) })}
                      />
                    )}
                    {(() => {
                      // Out for an external review after delivery: a striped bar that holds
                      // nobody's time; the next tasks start after it.
                      const ext = externalOf(task, span);
                      if (!ext) return null;
                      const w = Math.max(6, x(ext.end) - x(ext.start));
                      const tone = ext.received
                        ? "border-emerald-400/50 bg-[repeating-linear-gradient(135deg,rgba(52,211,153,0.28)_0_5px,transparent_5px_10px)] text-emerald-100"
                        : ext.late
                          ? "border-red-400/70 bg-[repeating-linear-gradient(135deg,rgba(248,113,113,0.35)_0_5px,transparent_5px_10px)] text-red-100"
                          : "border-violet-400/60 bg-[repeating-linear-gradient(135deg,rgba(167,139,250,0.35)_0_5px,transparent_5px_10px)] text-violet-100";
                      const text = ext.received ? t("erp.external.barReceived") : ext.late ? t("erp.external.barLate") : t("erp.external.bar", { h: task.externalReview.hours });
                      return (
                        <span
                          className={`absolute inset-y-0.5 flex items-center gap-1 overflow-hidden whitespace-nowrap rounded-md border border-dashed px-1.5 text-[10px] font-medium ${tone}`}
                          style={{ left: x(ext.start) - left, width: w }}
                          title={`${text} — ${nowFmt.format(new Date(ext.start))} → ${nowFmt.format(new Date(ext.end))}`}
                          onClick={() => setEditing(task)}
                        >
                          {w > 26 && <Building2 size={11} className="shrink-0" />}
                          {w > 110 && <span className="truncate">{text}</span>}
                        </span>
                      );
                    })()}
                    {!(task.externalReview?.hours > 0) && task.estimatedHours > 0 && !(task.expectedEnd && HOLDING_STATUSES.includes(task.status)) && (
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

      <Legend t={t} free={canSchedule} />

      <Modal open={Boolean(assignFor)} onClose={() => setAssignFor(null)} title={`${t("erp.gantt.freeAssign")} · ${assignFor?.name || ""}`} wide>
        {assignFor && (
          <AssignTask
            person={assignFor}
            onCancel={() => setAssignFor(null)}
            onCreated={() => {
              setAssignFor(null);
              load();
            }}
          />
        )}
      </Modal>

      <Modal open={Boolean(milestonesFor)} onClose={() => setMilestonesFor(null)} title={`${t("erp.milestones.title")} · ${milestonesFor?.name?.[lang] || ""}`} wide>
        {milestonesFor && (
          <ProjectMilestones
            key={milestonesFor.id}
            projectId={milestonesFor.id}
            milestones={milestonesOf[milestonesFor.id] || []}
            canBill={Boolean(data?.canBill)}
            onChanged={(list) => setData((d) => ({ ...d, projects: d.projects.map((p) => (p.id === milestonesFor.id ? { ...p, milestones: list } : p)) }))}
          />
        )}
      </Modal>
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={t("erp.gantt.editTask")}>
        {editing && (
          <ScheduleForm
            task={editing}
            canEdit={editable(editing)}
            canPlan={canSchedule}
            cal={cal}
            onChanged={() => {
              setEditing(null);
              load();
            }}
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

// `rank` (CEO, projects): drag handlers to move the project up or down the priority order.
function GroupLabel({ group, lang, t, collapsed, onToggle, load, today, cal, baselines, forecastEnd, onSaveBaseline, rank = null, milestones = null, onMilestones = null, evm = null }) {
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
  const last = baselines?.length ? baselines.reduce((a, b) => (b.n > a.n ? b : a)) : null;
  const nextBaseline = (last?.n || 0) + 1;
  const moved = Boolean(last && forecastEnd && Math.abs(new Date(forecastEnd) - new Date(last.end)) >= 60000);
  return (
    <div
      className={`group relative flex items-center gap-1 border-b border-white/10 bg-white/[0.04] pe-2 ${rank?.dragging ? "opacity-40" : ""}`}
      style={{ height: GROUP_H }}
      draggable={Boolean(rank)}
      onDragStart={rank?.onDragStart}
      onDragOver={rank?.onDragOver}
      onDrop={rank?.onDrop}
      onDragEnd={rank?.onDragEnd}
    >
      {/* Where the dragged project would land. */}
      {rank?.indicator && <span className={`pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-brand-orange ${rank.indicator === "after" ? "-bottom-px" : "-top-px"}`} />}
      {rank && (
        <span className="flex h-full shrink-0 cursor-grab items-center ps-1 text-white/30 hover:text-white/70 active:cursor-grabbing" title={t("erp.gantt.rankHint")}>
          <GripVertical size={14} />
        </span>
      )}
      <button type="button" dir="rtl" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 ps-3 text-start text-sm font-semibold" style={{ height: GROUP_H }}>
        <ChevronDown size={15} className={`shrink-0 text-white/50 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {!isProject && <TraineeBadge id={group.person.id} />}
        {isProject && (group.project.late || group.project.dueRisk) && (
          <AlertTriangle size={13} className="shrink-0 text-red-300" title={group.project.late ? undefined : t("erp.gantt.dueRisk")} />
        )}
        {weekLoad && (
          <span className={`shrink-0 text-[11px] font-normal ${weekLoad.over ? "text-red-300" : "text-white/45"}`} title={t("erp.gantt.weekLoad")}>
            {weekLoad.over && <AlertTriangle size={11} className="me-0.5 inline" />}
            {t("erp.gantt.hours", { n: Math.round(weekLoad.hours) })}
          </span>
        )}
      </button>
      {evm && (evm.spi !== null || evm.cpi !== null) && <EvmBadge evm={evm} t={t} lang={lang} />}
      {onMilestones && (
        <button
          type="button"
          onClick={onMilestones}
          title={t("erp.milestones.title")}
          className="flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-1 text-[10px] font-semibold text-white/35 hover:bg-white/10 hover:text-white"
        >
          <Diamond size={11} /> {milestones?.length || 0}
        </button>
      )}
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

// Earned value on a project row: schedule index (work done ÷ work planned by now) and
// hours index (work done ÷ hours spent). Green ≥ 0.95, amber ≥ 0.85, red below.
const EVM_TONE = { ok: "text-emerald-300", watch: "text-amber-300", bad: "text-red-300", none: "text-white/35" };
function EvmBadge({ evm, t, lang }) {
  const fmt = (v) => (v === null ? "—" : v.toFixed(2));
  const money = evm.money
    ? `
${t("erp.evm.cost", { planned: Math.round(evm.money.planned).toLocaleString(lang), actual: Math.round(evm.money.actual).toLocaleString(lang), forecast: Math.round(evm.money.forecast).toLocaleString(lang) })}`
    : "";
  const title = `${t("erp.evm.title")}
${t("erp.evm.hours", { bac: evm.bac, ev: evm.ev, pv: evm.pv, ac: evm.ac, eac: evm.eac })}${money}`;
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-md px-1 py-0.5 text-[10px] font-semibold tabular-nums" title={title}>
      <span className={EVM_TONE[evmTone(evm.spi)]}>{t("erp.evm.spi")} {fmt(evm.spi)}</span>
      <span className="text-white/20">·</span>
      <span className={EVM_TONE[evmTone(evm.cpi)]}>{t("erp.evm.cpi")} {fmt(evm.cpi)}</span>
    </span>
  );
}

// What the three bar colours mean.
function Legend({ t, free }) {
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
        <span className="h-4 w-7 rounded-sm border border-dashed border-violet-400/60 bg-[repeating-linear-gradient(135deg,rgba(167,139,250,0.35)_0_4px,transparent_4px_8px)]" />
        {t("erp.external.legend")}
      </span>
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
      {free && (
        <span className="flex items-center gap-2">
          <span className="h-3 w-6 rounded-sm border border-dashed border-emerald-400/70 bg-[repeating-linear-gradient(135deg,rgba(52,211,153,0.3)_0_4px,transparent_4px_8px)]" />
          {t("erp.gantt.freeLegend")}
        </span>
      )}
    </div>
  );
}

// Who has free time in the coming two weeks (GM / CEO): free now first, then the most
// free. Each gap jumps the chart to it; "Assign a task" opens a new task for them.
function FreeTimePanel({ people, now, cal, lang, t, onAssign, onShow }) {
  const [open, setOpen] = useState(false);
  const fmt = new Intl.DateTimeFormat(locale(lang), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...(cal?.tz ? { timeZone: cal.tz } : {}) });
  const hours = (ms) => t("erp.gantt.hours", { n: Math.round((ms / HOUR) * 10) / 10 });
  const freeNow = (p) => p.gaps[0].start <= now + 15 * 60000;
  const list = [...people].sort((a, b) => freeNow(b) - freeNow(a) || b.freeMs - a.freeMs);
  return (
    <div className="mb-3 rounded-xl border border-emerald-400/30 bg-emerald-500/[0.06]">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-2.5 text-start text-sm">
        <UserCheck size={16} className="shrink-0 text-emerald-300" />
        <span className="font-semibold text-emerald-100">{t("erp.gantt.freeTitle", { n: people.length })}</span>
        <span className="hidden text-xs text-white/45 md:inline">{t("erp.gantt.freeSub")}</span>
        <span className="ms-auto flex shrink-0 items-center gap-1 text-xs text-white/50">
          {t(open ? "erp.gantt.freeHide" : "erp.gantt.freeShow")}
          <ChevronDown size={14} className={`transition-transform ${open ? "" : "-rotate-90"}`} />
        </span>
      </button>
      {open && (
        <ul className="divide-y divide-white/5 border-t border-white/5">
          {list.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
              <span className="flex min-w-[140px] items-center gap-2 text-sm font-medium" dir="auto">
                <Avatar name={p.name} src={p.avatarUrl} size={24} />
                {p.name}
              </span>
              {freeNow(p) && <span className="rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-bold text-brand-navy">{t("erp.gantt.freeNow")}</span>}
              <span className="text-xs font-medium text-emerald-200">{hours(p.freeMs)}</span>
              <span className="flex flex-wrap gap-1.5">
                {p.gaps.slice(0, 3).map((g) => (
                  <button
                    key={g.start}
                    type="button"
                    onClick={() => onShow(g.start)}
                    className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/70 hover:border-emerald-400/50 hover:text-white"
                    dir="auto"
                  >
                    {fmt.format(g.start)} → {fmt.format(g.end)} · {hours(g.ms)}
                  </button>
                ))}
                {p.gaps.length > 3 && <span className="px-1 text-[11px] text-white/40">{t("erp.gantt.freeMore", { n: p.gaps.length - 3 })}</span>}
              </span>
              <Button variant="ghost" className="ms-auto" onClick={() => onAssign(p)}>
                <Plus size={14} /> {t("erp.gantt.freeAssign")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// A new task for an employee with free time; the server puts it in their first free slot.
function AssignTask({ person, onCreated, onCancel }) {
  const lookups = useTaskLookups();
  return <TaskForm lookups={lookups} preset={{ assigneeId: person.id }} onCreated={onCreated} onCancel={onCancel} />;
}

// Edit a task from the chart. Start, due time and working hours move together (the
// hours are the working time between them), and a new employee without new times puts
// the task in their first free time. Only what changed is sent.
function ScheduleForm({ task, canEdit, canPlan, cal, onSave, onCancel, onChanged }) {
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
          {/* The finish follows from the start and the working hours (the Gantt decides it). */}
          <div>
            <p className="mb-2 text-sm font-medium text-white/70">{t("erp.gantt.due")}</p>
            <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white/70" dir="ltr">
              {form.dueAt ? new Date(form.dueAt).toLocaleString(lang === "ar" ? "ar" : "en", { dateStyle: "medium", timeStyle: "short" }) : "—"}
            </p>
          </div>
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
      {/* The CEO: how long the work is out for an external review after delivery. */}
      {canPlan && <ExternalHoursField task={task} onChanged={onChanged} />}
      {task.externalReview && <ExternalReviewBox task={task} onChanged={onChanged} />}
      {/* Cancel requests and cancelling / restoring, for the GM / CEO. */}
      {canPlan && <TaskCancel task={task} who={{ canPlan: true }} onDone={onChanged} />}
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
