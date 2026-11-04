"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, Clock, FolderKanban, Search, Timer } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { COMPANY_TASKS_CHANNEL, useOnlineUsers, usePollingFallback, useRealtimeEvent } from "@/context/RealtimeContext";
import { api } from "@/lib/clientApi";
import { formatDateTime } from "@/lib/formatTime";
import Avatar from "@/components/erp/ui/Avatar";
import { PageHeader, Select } from "@/components/erp/ui/fields";
import TaskRow, { StatusBadge, taskHeading } from "@/components/erp/tasks/TaskRow";
import TaskDrawer from "@/components/erp/tasks/TaskDrawer";
import { useTaskLookups } from "@/components/erp/tasks/useTaskLookups";
import { formatDuration, liveActiveMs, useNow } from "@/components/erp/tasks/taskUi";
import { SkeletonList } from "@/components/erp/ui/Loading";
import TraineeBadge from "@/components/erp/ui/TraineeBadge";

const MODES = ["person", "project"];
// Working first, then what's paused, then the queue, then what's waiting for the head.
const ORDER = { in_progress: 0, help: 1, on_hold: 2, todo: 3, submitted: 4 };
const byStatus = (a, b) => ORDER[a.status] - ORDER[b.status] || new Date(a.dueAt || 8.64e15) - new Date(b.dueAt || 8.64e15);

// One line of a person's card.
function MiniTask({ task, now, onOpen }) {
  const { lang } = useLanguage();
  const running = task.status === "in_progress";
  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm hover:bg-white/5"
    >
      <span className="w-12 shrink-0 text-xs text-white/40" dir="ltr">
        #{task.number}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{taskHeading(task, lang)}</span>
        {task.project && <span className="block truncate text-xs text-white/40">{task.project.name?.[lang]}</span>}
      </span>
      {running && (
        <span className="flex shrink-0 items-center gap-1 text-xs text-sky-300" dir="ltr">
          <Timer size={12} /> {formatDuration(liveActiveMs(task, now))}
        </span>
      )}
      {task.late && <AlertTriangle size={13} className="shrink-0 text-red-300" />}
      <StatusBadge status={task.status} />
    </button>
  );
}

function PersonCard({ person, tasks, meId, online, departmentName, now, onOpen }) {
  const { t, lang } = useLanguage();
  const current = tasks.find((x) => x.status === "in_progress");
  const rest = tasks.filter((x) => x !== current);

  return (
    <div className={`rounded-2xl border bg-white/[0.03] p-4 ${current ? "border-sky-500/30" : "border-white/10"}`}>
      <div className="flex items-center gap-3">
        <Avatar name={person.name} src={person.avatarUrl} size={40} online={online} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {person.name}
            <TraineeBadge id={person.id} className="ms-2" />
            {person.id === meId && <span className="ms-2 text-xs font-normal text-brand-orange">({t("erp.team.you")})</span>}
          </p>
          <p className="truncate text-xs text-white/45">
            {[person.department ? departmentName(person.department) : "", tasks.length ? t("erp.team.openTasks", { n: tasks.length }) : ""]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>

      {current && (
        <button
          type="button"
          onClick={() => onOpen(current.id)}
          className="mt-3 block w-full rounded-xl border border-sky-500/30 bg-sky-500/[0.08] px-3 py-2.5 text-start hover:bg-sky-500/[0.14]"
        >
          <span className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-wider text-sky-300">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-300" />
              {t("erp.team.nowOn")}
            </span>
            <span className="flex items-center gap-1 normal-case tracking-normal" dir="ltr">
              <Timer size={12} /> {formatDuration(liveActiveMs(current, now))}
            </span>
          </span>
          <span className="mt-1 block truncate text-sm font-medium">
            <span className="me-1.5 text-white/45" dir="ltr">
              #{current.number}
            </span>
            {taskHeading(current, lang)}
          </span>
          {(current.project || current.dueAt) && (
            <span className={`mt-0.5 flex items-center gap-1 truncate text-xs ${current.late ? "text-red-300" : "text-white/45"}`}>
              {current.project?.name?.[lang]}
              {current.dueAt && (
                <>
                  {current.project && " · "}
                  {current.late ? <AlertTriangle size={11} /> : <Clock size={11} />}
                  {formatDateTime(current.dueAt, lang)}
                </>
              )}
            </span>
          )}
        </button>
      )}

      {rest.length > 0 && (
        <div className="mt-2 max-h-64 space-y-0.5 overflow-y-auto">
          {rest.map((task) => (
            <MiniTask key={task.id} task={task} now={now} onOpen={onOpen} />
          ))}
        </div>
      )}
      {tasks.length === 0 && <p className="mt-3 text-sm text-white/35">{t("erp.team.noActive")}</p>}
    </div>
  );
}

export default function TeamTasks({ meId }) {
  const { t, lang } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lookups = useTaskLookups();
  const online = useOnlineUsers();
  const [tasks, setTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState("person");
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [showFree, setShowFree] = useState(true);
  const [openId, setOpenId] = useState(searchParams.get("task"));

  const load = useCallback(async () => {
    const data = await api("/api/tasks?view=team").catch(() => null);
    if (data) setTasks(data.tasks);
    setLoaded(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  usePollingFallback(load, 20000);
  // Any task change in the company: reload, but at most once a second during bursts.
  const reloadTimer = useRef(null);
  useRealtimeEvent(COMPANY_TASKS_CHANNEL, "task:updated", () => {
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(load, 1000);
  });
  useEffect(() => () => clearTimeout(reloadTimer.current), []);

  const now = useNow(tasks.some((x) => x.status === "in_progress"));

  const view = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, "");
    const taskText = (x) =>
      [x.number, taskHeading(x, lang), x.project?.name?.[lang], x.project?.code, lookups.typeName(x.type)].filter(Boolean).join(" ").toLowerCase();

    // Everyone active, plus anyone (e.g. deactivated) who still holds open tasks.
    const people = new Map(lookups.people.map((p) => [p.id, p]));
    for (const x of tasks) {
      if (x.assignee && !people.has(x.assignee.id)) people.set(x.assignee.id, { ...x.assignee, department: x.department });
    }
    const tasksOf = new Map();
    for (const x of tasks) {
      if (!x.assignee) continue;
      if (!tasksOf.has(x.assignee.id)) tasksOf.set(x.assignee.id, []);
      tasksOf.get(x.assignee.id).push(x);
    }

    const cards = [];
    for (const person of people.values()) {
      if (department && person.department !== department) continue;
      let list = (tasksOf.get(person.id) || []).slice().sort(byStatus);
      // A name match shows all of that person's work; otherwise show only matching tasks.
      if (q && !person.name.toLowerCase().includes(q)) {
        list = list.filter((x) => taskText(x).includes(q));
        if (!list.length) continue;
      }
      if (!list.length && !showFree) continue;
      cards.push({ person, tasks: list });
    }
    const rank = (c) => (c.tasks.some((x) => x.status === "in_progress") ? 0 : c.tasks.length ? 1 : 2);
    cards.sort((a, b) => rank(a) - rank(b) || b.tasks.length - a.tasks.length || a.person.name.localeCompare(b.person.name));

    const visibleTasks = cards.flatMap((c) => c.tasks);
    const projects = new Map();
    for (const x of visibleTasks) {
      const key = x.project?.id || "";
      if (!projects.has(key)) projects.set(key, { project: x.project, tasks: [] });
      projects.get(key).tasks.push(x);
    }
    const projectGroups = [...projects.values()]
      .map((g) => ({ ...g, tasks: g.tasks.sort(byStatus) }))
      .sort((a, b) => (!a.project) - (!b.project) || b.tasks.length - a.tasks.length);

    return {
      cards,
      projectGroups,
      counts: {
        working: new Set(visibleTasks.filter((x) => x.status === "in_progress").map((x) => x.assignee?.id)).size,
        review: visibleTasks.filter((x) => x.status === "submitted").length,
        free: cards.filter((c) => !c.tasks.length).length,
      },
    };
  }, [tasks, lookups, query, department, showFree, lang]);

  function open(id) {
    setOpenId(id);
    router.replace(id ? `/dashboard/team-tasks?task=${id}` : "/dashboard/team-tasks", { scroll: false });
  }

  return (
    <div className="max-w-7xl">
      <PageHeader title={t("erp.nav.teamTasks")} subtitle={t("erp.team.subtitle")} />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-sky-500/15 px-3 py-1 text-sky-200">
          {t("erp.team.workingNow")}: {view.counts.working}
        </span>
        <span className="rounded-full bg-brand-orange/15 px-3 py-1 text-brand-orange">
          {t("erp.team.waitingReview")}: {view.counts.review}
        </span>
        {mode === "person" && showFree && (
          <span className="rounded-full bg-white/10 px-3 py-1 text-white/60">
            {t("erp.team.free")}: {view.counts.free}
          </span>
        )}
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="relative min-w-60 flex-1">
          <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("erp.team.search")}
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pe-3 ps-9 text-sm outline-none focus:border-white/30"
          />
        </label>
        <div className="w-56">
          <Select
            value={department}
            onChange={setDepartment}
            placeholder={t("erp.team.allDepartments")}
            options={lookups.departments.map((d) => ({ value: d.id, label: d.name?.[lang] }))}
          />
        </div>
        <div className="relative flex rounded-xl border border-white/10 p-1">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              data-active={mode === m}
              className="relative rounded-lg px-3 py-1.5 text-sm text-white/60 data-[active=true]:text-white"
            >
              {mode === m && <motion.span layoutId="team-mode" className="absolute inset-0 rounded-lg bg-white/10" />}
              <span className="relative">{t(`erp.team.by${m === "person" ? "Person" : "Project"}`)}</span>
            </button>
          ))}
        </div>
        {mode === "person" && (
          <label className="flex items-center gap-2 py-2 text-sm text-white/60">
            <input type="checkbox" checked={showFree} onChange={(e) => setShowFree(e.target.checked)} className="accent-brand-orange" />
            {t("erp.team.showFree")}
          </label>
        )}
      </div>

      {!loaded && <SkeletonList rows={6} />}
      <div className={loaded ? "animate-fade-up" : "hidden"}>
        {mode === "person" ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {view.cards.map(({ person, tasks: list }) => (
              <PersonCard
                key={person.id}
                person={person}
                tasks={list}
                meId={meId}
                online={online.has(person.id)}
                departmentName={lookups.departmentName}
                now={now}
                onOpen={open}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            {view.projectGroups.map(({ project, tasks: list }) => (
              <section key={project?.id || "none"}>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/70">
                  <FolderKanban size={15} />
                  {project ? project.name?.[lang] : t("erp.team.noProject")}
                  {project?.code && (
                    <span className="text-xs font-normal text-white/40" dir="ltr">
                      {project.code}
                    </span>
                  )}
                  <span className="text-xs font-normal text-white/40">({list.length})</span>
                </h2>
                <div className="space-y-2">
                  {list.map((task) => (
                    <TaskRow key={task.id} task={task} lookups={lookups} now={now} onOpen={open} showAssignee />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        {(mode === "person" ? view.cards : view.projectGroups).length === 0 && (
          <p className="py-10 text-center text-white/40">{t("erp.team.nothing")}</p>
        )}
      </div>

      <TaskDrawer taskId={openId} lookups={lookups} onClose={() => open(null)} onChanged={load} onOpenTask={open} />
    </div>
  );
}
