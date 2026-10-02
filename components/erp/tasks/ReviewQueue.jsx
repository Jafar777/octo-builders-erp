"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { usePollingFallback, useRealtimeEvent, userChannelName } from "@/context/RealtimeContext";
import { api } from "@/lib/clientApi";
import { PageHeader, Select } from "@/components/erp/ui/fields";
import TaskRow from "@/components/erp/tasks/TaskRow";
import TaskDrawer from "@/components/erp/tasks/TaskDrawer";
import { useTaskLookups } from "@/components/erp/tasks/useTaskLookups";
import { SkeletonList } from "@/components/erp/ui/Loading";

export default function ReviewQueue({ meId }) {
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lookups = useTaskLookups();
  const [tasks, setTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [person, setPerson] = useState("");
  const [openId, setOpenId] = useState(searchParams.get("task"));

  const load = useCallback(async () => {
    const data = await api("/api/tasks?view=review").catch(() => null);
    if (data) setTasks(data.tasks);
    setLoaded(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  usePollingFallback(load, 20000);
  useRealtimeEvent(userChannelName(meId), "task:updated", load);

  const visible = useMemo(
    () =>
      tasks
        .filter((x) => !person || x.assignee?.id === person)
        .sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt)),
    [tasks, person]
  );
  const assignees = [...new Map(tasks.map((x) => [x.assignee?.id, x.assignee])).values()].filter(Boolean);

  function open(id) {
    setOpenId(id);
    router.replace(id ? `/dashboard/reviews?task=${id}` : "/dashboard/reviews", { scroll: false });
  }

  return (
    <div className="max-w-5xl">
      <PageHeader title={t("erp.nav.reviews")} subtitle={t("erp.tasks.reviewSubtitle", { count: tasks.length })} />
      {assignees.length > 1 && (
        <div className="mb-5 max-w-xs">
          <Select value={person} onChange={setPerson} placeholder={t("erp.messages.allPeople")} options={assignees.map((a) => ({ value: a.id, label: a.name }))} />
        </div>
      )}
      {!loaded && <SkeletonList rows={5} />}
      <div className={`space-y-2 ${loaded ? "animate-fade-up" : "hidden"}`}>
        {visible.map((task) => (
          <TaskRow key={task.id} task={task} lookups={lookups} now={0} onOpen={open} showAssignee />
        ))}
        {visible.length === 0 && <p className="py-10 text-center text-white/40">{t("erp.tasks.nothingToReview")}</p>}
      </div>
      <TaskDrawer taskId={openId} lookups={lookups} onClose={() => open(null)} onChanged={load} onOpenTask={open} />
    </div>
  );
}
