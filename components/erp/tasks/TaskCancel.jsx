"use client";

import { useState } from "react";
import { Ban, CheckCircle2, RotateCcw, Undo2, XCircle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDateTime } from "@/lib/formatTime";
import { cancelNeedsApproval, canUndoStart } from "@/lib/gantt";
import { Button, ErrorText } from "@/components/erp/ui/fields";
import { useNow } from "@/components/erp/tasks/taskUi";

const ACTIVE = ["todo", "in_progress", "on_hold", "help"];

// Cancelling a task (see lib/taskCancel): "Undo start" for a start pressed by mistake,
// cancelling (project work: the employee asks with a reason, the GM / CEO decide), the
// pending request with its decision, and "Restore" once cancelled.
// `who` = { isAssignee, canManage, canPlan }.
export default function TaskCancel({ task, who, onDone }) {
  const { t, lang } = useLanguage();
  const now = useNow(["in_progress", "on_hold"].includes(task.status) && Boolean(task.startedAt), 15000);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const req = task.cancelRequest;
  const pending = req?.status === "pending";
  const needsApproval = cancelNeedsApproval(task);

  async function act(action, extra = {}) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/tasks/${task.id}/action`, { method: "POST", body: { action, ...extra } });
      setOpen(false);
      setText("");
      onDone?.();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  const reasonBox = (
    <textarea
      rows={2}
      value={text}
      onChange={(e) => setText(e.target.value)}
      placeholder={t(pending ? "erp.tasks.decisionNote" : "erp.tasks.cancelReason")}
      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/30"
    />
  );

  if (task.status === "cancelled") {
    return (
      <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold text-white/70">
          <Ban size={15} />
          {task.cancelledBy ? t("erp.tasks.cancelledBy", { name: task.cancelledBy.name }) : t("erp.tasks.status.cancelled")}
          {task.cancelledAt && <span className="font-normal text-white/40">· {formatDateTime(task.cancelledAt, lang)}</span>}
        </p>
        {task.cancelReason && <p className="whitespace-pre-wrap text-white/60">{task.cancelReason}</p>}
        {who.canPlan && (
          <Button variant="ghost" onClick={() => window.confirm(t("erp.tasks.confirmRestore")) && act("restore")} disabled={busy}>
            <RotateCcw size={15} /> {t("erp.tasks.restoreTask")}
          </Button>
        )}
        <ErrorText>{error}</ErrorText>
      </div>
    );
  }
  if (!ACTIVE.includes(task.status)) return null;

  const undo = who.isAssignee && canUndoStart(task, now);
  const canCancel = who.isAssignee || who.canManage || who.canPlan;

  return (
    <div className="space-y-3">
      {undo && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-sky-400/30 bg-sky-500/[0.06] px-4 py-3">
          <p className="flex-1 text-xs text-sky-100">{t("erp.tasks.undoStartHint")}</p>
          <Button variant="ghost" onClick={() => act("undo_start")} disabled={busy}>
            <Undo2 size={15} /> {t("erp.tasks.undoStart")}
          </Button>
        </div>
      )}

      {pending ? (
        <div className="space-y-3 rounded-2xl border border-amber-400/40 bg-amber-500/[0.07] p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-amber-100">
            <Ban size={15} />
            {who.isAssignee && req.by?.id === task.assignee?.id ? t("erp.tasks.cancelPendingMine") : t("erp.tasks.cancelPending", { name: req.by?.name || "—" })}
            <span className="font-normal text-white/40">· {formatDateTime(req.at, lang)}</span>
          </p>
          <p className="whitespace-pre-wrap text-white/75">{req.reason}</p>
          {who.canPlan && (
            <>
              {reasonBox}
              <div className="flex flex-wrap gap-2">
                <Button variant="danger" onClick={() => act("cancel_decision", { decision: "approve", note: text })} disabled={busy}>
                  <CheckCircle2 size={15} /> {t("erp.tasks.approveCancel")}
                </Button>
                <Button variant="ghost" onClick={() => act("cancel_decision", { decision: "reject", note: text })} disabled={busy}>
                  <XCircle size={15} /> {t("erp.tasks.rejectCancel")}
                </Button>
              </div>
            </>
          )}
        </div>
      ) : (
        canCancel && (
          <div className="space-y-2">
            {req?.status === "rejected" && (
              <p className="text-xs text-white/50">
                {t("erp.tasks.cancelRejectedBy", { name: req.decidedBy?.name || "—" })}
                {req.note ? ` — ${req.note}` : ""}
              </p>
            )}
            {!open ? (
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => (needsApproval ? setOpen(true) : window.confirm(t("erp.tasks.confirmCancel")) && act("cancel"))}
              >
                <Ban size={15} /> {t(needsApproval && !who.canPlan ? "erp.tasks.requestCancel" : "erp.tasks.cancelTask")}
              </Button>
            ) : (
              <div className="space-y-2 rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-4">
                <p className="text-xs text-red-100/80">{t(who.canPlan ? "erp.tasks.cancelReasonGm" : "erp.tasks.cancelReasonHint")}</p>
                {reasonBox}
                <div className="flex flex-wrap gap-2">
                  <Button variant="danger" onClick={() => act("cancel", { reason: text })} disabled={busy || !text.trim()}>
                    {t(who.canPlan ? "erp.tasks.cancelTask" : "erp.tasks.sendCancelRequest")}
                  </Button>
                  <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                    {t("common.cancel")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
