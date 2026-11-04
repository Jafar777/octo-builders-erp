"use client";

import { useState } from "react";
import { Building2, CheckCircle2, RotateCcw } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDateTime } from "@/lib/formatTime";
import { Button, ErrorText, Input } from "@/components/erp/ui/fields";
import { canRouteStages } from "@/components/erp/projects/StageRouting";

// A task that goes to another office for review after it's handed in (lib/gantt.js
// readyTime): where the review stands, and "review received" for the task's employee,
// its department's managers and the CEO. The tasks after it can't start until then.
export function ExternalReviewBox({ task, onChanged }) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ext = task.externalReview;
  if (!ext) return null;

  const canMark = canRouteStages(user) || task.assignee?.id === user?.id || user?.permissions?.includes("tasks.review");
  const delivered = ["submitted", "approved", "done"].includes(task.status);

  async function act(action) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/tasks/${task.id}/external-review`, { method: "POST", body: { action } });
      onChanged?.();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  const tone = ext.receivedAt ? "border-emerald-500/30 bg-emerald-500/[0.07]" : ext.awaiting ? "border-violet-400/40 bg-violet-400/[0.08]" : "border-white/10 bg-white/[0.03]";
  return (
    <div className={`space-y-2 rounded-2xl border p-4 text-sm ${tone}`}>
      <p className="flex items-center gap-2 font-semibold text-violet-100">
        <Building2 size={16} /> {t("erp.external.label")} · {t("erp.gantt.hours", { n: ext.hours })}
      </p>
      {ext.receivedAt ? (
        <p className="text-emerald-200">{t("erp.external.receivedAt", { at: formatDateTime(ext.receivedAt, lang), name: ext.receivedBy?.name || "—" })}</p>
      ) : ext.awaiting ? (
        <p className="text-violet-100/80">{t("erp.external.waiting")}</p>
      ) : (
        <p className="text-white/55">{t("erp.external.notSentYet", { h: ext.hours })}</p>
      )}
      <ErrorText>{error}</ErrorText>
      {canMark && delivered && (
        <div className="flex flex-wrap gap-2">
          {!ext.receivedAt ? (
            <Button onClick={() => act("received")} loading={busy}>
              <CheckCircle2 size={15} /> {t("erp.external.markReceived")}
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => act("reopen")} loading={busy}>
              <RotateCcw size={15} /> {t("erp.external.reopen")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// The CEO sets (or changes, or removes with 0) how long a task's external review takes.
export function ExternalHoursField({ task, onChanged }) {
  const { t } = useLanguage();
  const [hours, setHours] = useState(String(task.externalReview?.hours || ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = task.externalReview?.hours || 0;
  const changed = (Number(hours) || 0) !== current;

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/tasks/${task.id}/external-review`, { method: "POST", body: { hours: Number(hours) || 0 } });
      onChanged?.();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-violet-400/25 bg-violet-400/[0.05] p-3">
      <div className="flex items-end gap-2">
        <div className="w-48">
          <Input type="number" min="0" max="2000" step="0.5" label={t("erp.external.hours")} value={hours} onChange={setHours} dir="ltr" />
        </div>
        {changed && (
          <Button type="button" variant="ghost" onClick={save} loading={busy}>
            {t("common.save")}
          </Button>
        )}
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-white/45">{t("erp.external.formHint")}</p>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
