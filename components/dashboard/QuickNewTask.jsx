"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/clientApi";
import Modal from "@/components/erp/ui/Modal";
import StartWork from "@/components/erp/tasks/StartWork";
import TaskForm from "@/components/erp/tasks/TaskForm";
import { useTaskLookups } from "@/components/erp/tasks/useTaskLookups";
import { canRouteStages } from "@/components/erp/projects/StageRouting";

// "New task" on the Overview (change request CR-5): the same as on My tasks — an employee
// asks for project work (the stage's manager gives its hours); whoever plans or gives out
// work gets the task form.
export default function QuickNewTask({ onClose, onDone }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();
  const lookups = useTaskLookups();
  const plans = canRouteStages(user) || Boolean(user?.permissions?.includes("tasks.assign"));
  const [selfStart, setSelfStart] = useState(null);
  useEffect(() => {
    api("/api/tasks/self-start")
      .then((d) => setSelfStart(d.on))
      .catch(() => setSelfStart(false));
  }, []);
  const ask = !plans || selfStart;
  const openTask = (id) => router.push(`/dashboard/tasks?task=${id}`);
  return (
    <Modal open onClose={onClose} title={t("erp.tasks.new")} wide>
      {ask ? (
        <StartWork lookups={lookups} onClose={onClose} onOpenTask={openTask} onStarted={(task) => (onDone(), openTask(task.id))} />
      ) : (
        <TaskForm lookups={lookups} onCancel={onClose} onCreated={(task) => (onDone(), openTask(task.id))} />
      )}
    </Modal>
  );
}
