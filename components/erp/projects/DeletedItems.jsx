"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDateTime } from "@/lib/formatTime";
import Modal from "@/components/erp/ui/Modal";
import { Button, ErrorText } from "@/components/erp/ui/fields";
import { useConfirm } from "@/components/erp/ui/Feedback";

// Deleting projects / tasks and the Deleted items list (lib/trash.js): projects.delete only.
export const useCanDelete = () => {
  const { user } = useAuth();
  return Boolean(user?.isStaff && user.permissions?.includes("projects.delete"));
};

// "Delete project" (project settings). Goes back to the projects list afterwards.
export function DeleteProjectButton({ project }) {
  const { t } = useLanguage();
  const confirm = useConfirm();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!useCanDelete()) return null;
  async function remove() {
    if (!(await confirm({ text: t("erp.trash.confirmProject", { name: project.name?.ar || project.name?.en || "" }), kind: "delete" }))) return;
    setBusy(true);
    try {
      await api(`/api/work-projects/${project.id}`, { method: "DELETE" });
      router.push("/dashboard/projects");
    } catch (err) {
      setError(errorText(t, err));
      setBusy(false);
    }
  }
  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.05] p-4">
      <p className="font-semibold text-red-200">{t("erp.trash.deleteProject")}</p>
      <p className="mt-1 text-sm text-white/60">{t("erp.trash.deleteProjectHint")}</p>
      <ErrorText>{error}</ErrorText>
      <Button variant="danger" className="mt-3" onClick={remove} disabled={busy}>
        <Trash2 size={16} /> {t("erp.trash.deleteProject")}
      </Button>
    </div>
  );
}

// "Delete task" (task window).
export function DeleteTaskButton({ task, onDeleted }) {
  const { t } = useLanguage();
  const confirm = useConfirm();
  const [error, setError] = useState("");
  if (!useCanDelete()) return null;
  async function remove() {
    if (!(await confirm({ text: t("erp.trash.confirmTask", { n: task.number }), kind: "delete" }))) return;
    try {
      await api(`/api/tasks/${task.id}`, { method: "DELETE" });
      onDeleted?.();
    } catch (err) {
      setError(errorText(t, err));
    }
  }
  return (
    <div>
      <button type="button" onClick={remove} className="flex items-center gap-1.5 text-sm text-red-300 hover:text-red-200">
        <Trash2 size={14} /> {t("erp.trash.deleteTask")}
      </button>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

// "Deleted items" button + list: restore, or erase now.
export function DeletedItemsButton() {
  const { t, lang } = useLanguage();
  const confirm = useConfirm();
  const can = useCanDelete();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    api("/api/trash")
      .then(setData)
      .catch((err) => setError(errorText(t, err)));
  }, [t]);
  useEffect(() => {
    if (open) load();
  }, [open, load]);
  if (!can) return null;

  async function act(item, action) {
    if (action === "purge" && !(await confirm({ text: t("erp.trash.confirmPurge", { name: item.label }), kind: "delete" }))) return;
    setError("");
    try {
      await api(`/api/trash/${item.id}`, { method: "POST", body: { action } });
      load();
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        <Trash2 size={16} /> {t("erp.trash.title")}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("erp.trash.title")} wide>
        <p className="mb-4 text-sm text-white/60">{t("erp.trash.hint", { days: data?.days || 30 })}</p>
        <ErrorText>{error}</ErrorText>
        <div className="space-y-2">
          {data?.items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  <span className="me-2 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/70">{t(`erp.trash.kind.${item.kind}`)}</span>
                  {item.label}
                </p>
                <p className="mt-1 text-xs text-white/55">
                  {[
                    item.kind === "project" ? t("erp.trash.withTasks", { n: item.counts.tasks || 0 }) : "",
                    t("erp.trash.deletedBy", { name: item.deletedBy || "—", at: formatDateTime(item.deletedAt, lang) }),
                    t("erp.trash.erasedOn", { at: formatDateTime(item.purgeAt, lang) }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Button variant="ghost" onClick={() => act(item, "restore")}>
                <ArchiveRestore size={16} /> {t("erp.trash.restore")}
              </Button>
              <button type="button" onClick={() => act(item, "purge")} className="text-sm text-red-300 hover:text-red-200">
                {t("erp.trash.purge")}
              </button>
            </div>
          ))}
          {data && data.items.length === 0 && <p className="py-8 text-center text-white/60">{t("erp.trash.empty")}</p>}
        </div>
      </Modal>
    </>
  );
}
