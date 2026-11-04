"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { motion } from "framer-motion";
import { useLanguage } from "@/context/LanguageContext";
import { usePollingFallback, useRealtimeEvent, userChannelName } from "@/context/RealtimeContext";
import { api } from "@/lib/clientApi";
import Modal from "@/components/erp/ui/Modal";
import { Button, PageHeader } from "@/components/erp/ui/fields";
import TaskRow from "@/components/erp/tasks/TaskRow";
import TaskForm from "@/components/erp/tasks/TaskForm";
import TaskDrawer from "@/components/erp/tasks/TaskDrawer";
import Stars from "@/components/erp/tasks/Stars";
import { useTaskLookups } from "@/components/erp/tasks/useTaskLookups";
import { useNow } from "@/components/erp/tasks/taskUi";
import { SkeletonList } from "@/components/erp/ui/Loading";
import TaskLog from "@/components/erp/tasks/TaskLog";
import { EmptyState } from "@/components/erp/ui/DataTools";

const TABS = ["active", "submitted", "finished"];
// The employee's own monthly task log (?tab=log), next to the lists above.
const LOG = "log";
const FINISHED_DAYS = 45;

export default function MyTasks({ meId }) {
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lookups = useTaskLookups();
  const [tasks, setTasks] = useState([]);
  const [rating, setRating] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState(searchParams.get("tab") === LOG ? LOG : "active");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(searchParams.get("task"));

  const load = useCallback(async () => {
    const data = await api("/api/tasks?view=mine").catch(() => null);
    if (data) {
      setTasks(data.tasks);
      setRating(data.rating || null);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  usePollingFallback(load, 20000);
  useRealtimeEvent(userChannelName(meId), "task:updated", load);

  const running = tasks.some((x) => x.status === "in_progress");
  const now = useNow(running);

  const groups = useMemo(() => {
    const cutoff = now - FINISHED_DAYS * 86400000;
    const order = { in_progress: 0, help: 1, on_hold: 2, todo: 3 };
    const active = tasks
      .filter((x) => ["todo", "in_progress", "on_hold", "help"].includes(x.status))
      .sort((a, b) => order[a.status] - order[b.status] || new Date(a.dueAt || 8.64e15) - new Date(b.dueAt || 8.64e15));
    return {
      active,
      submitted: tasks.filter((x) => x.status === "submitted"),
      finished: tasks.filter(
        (x) => ["approved", "rejected", "done", "cancelled"].includes(x.status) && new Date(x.submittedAt || x.createdAt).getTime() > cutoff
      ),
    };
  }, [tasks, now]);

  // Within "active", show the Excel's three ready lists first.
  const sections =
    tab === "active"
      ? [
          { key: "working", list: groups.active.filter((x) => x.status !== "todo") },
          { key: "revisions", list: groups.active.filter((x) => x.status === "todo" && x.kind === "revision") },
          { key: "helpRequests", list: groups.active.filter((x) => x.status === "todo" && x.kind === "help") },
          { key: "ready", list: groups.active.filter((x) => x.status === "todo" && !["revision", "help"].includes(x.kind)) },
        ]
      : tab === LOG
        ? []
        : [{ key: tab, list: groups[tab] }];

  function open(id) {
    setOpenId(id);
    router.replace(id ? `/dashboard/tasks?task=${id}` : "/dashboard/tasks", { scroll: false });
  }
  function changeTab(key) {
    setTab(key);
    setOpenId(null);
    router.replace(key === LOG ? `/dashboard/tasks?tab=${LOG}` : "/dashboard/tasks", { scroll: false });
  }

  return (
    <div className={tab === LOG ? "" : "max-w-5xl"}>
      <PageHeader
        title={t("erp.nav.tasks")}
        subtitle={t("erp.tasks.subtitle")}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} /> {t("erp.tasks.new")}
          </Button>
        }
      />

      {rating && (
        <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
          <span className="text-sm text-white/60">{t("erp.tasks.myRating")}</span>
          {rating.count > 0 ? (
            <>
              <span className="flex items-center gap-2" dir="ltr">
                <span className="text-2xl font-bold">{rating.average.toFixed(1)}</span>
                <span className="text-sm text-white/60">/ 5</span>
              </span>
              <Stars value={rating.average} size={20} />
              <span className="text-xs text-white/60">{t("erp.tasks.ratedTasks", { n: rating.count })}</span>
            </>
          ) : (
            <span className="text-sm text-white/60">{t("erp.tasks.noRating")}</span>
          )}
        </div>
      )}

      <div className="relative mb-6 flex gap-1 border-b border-white/10">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => changeTab(key)}
            className="relative px-4 py-3 text-sm font-medium text-white/60 data-[active=true]:text-white"
            data-active={tab === key}
          >
            {t(`erp.tasks.tab.${key}`)} ({groups[key].length})
            {tab === key && <motion.span layoutId="mytasks-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-orange" />}
          </button>
        ))}
        <button
          type="button"
          onClick={() => changeTab(LOG)}
          className="relative px-4 py-3 text-sm font-medium text-white/60 data-[active=true]:text-white"
          data-active={tab === LOG}
        >
          {t("erp.tasks.tab.log")}
          {tab === LOG && <motion.span layoutId="mytasks-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-orange" />}
        </button>
      </div>

      {/* The log has its own month, task drawer and data. */}
      {tab === LOG && <TaskLog mine />}

      {!loaded && tab !== LOG && <SkeletonList rows={6} avatar={false} />}
      <div className={`space-y-8 ${loaded && tab !== LOG ? "animate-fade-up" : "hidden"}`}>
        {sections.map(({ key, list }) =>
          list.length === 0 && tab === "active" ? null : (
            <section key={key}>
              {tab === "active" && <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/60">{t(`erp.tasks.section.${key}`)}</h2>}
              <div className="space-y-2">
                {list.map((task) => (
                  <TaskRow key={task.id} task={task} lookups={lookups} now={now} onOpen={open} projectFirst />
                ))}
                {list.length === 0 && <EmptyState compact text={t("erp.tasks.none")} />}
              </div>
            </section>
          )
        )}
        {tab === "active" && groups.active.length === 0 && <EmptyState compact text={t("erp.tasks.none")} />}
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title={t("erp.tasks.new")} wide>
        {creating && (
          <TaskForm
            lookups={lookups}
            onCancel={() => setCreating(false)}
            onCreated={(task) => {
              setCreating(false);
              load();
              open(task.id);
            }}
          />
        )}
      </Modal>

      {tab !== LOG && <TaskDrawer taskId={openId} lookups={lookups} onClose={() => open(null)} onChanged={load} onOpenTask={open} />}
    </div>
  );
}
