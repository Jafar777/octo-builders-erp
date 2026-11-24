"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDate, formatDateTime } from "@/lib/formatTime";
import { Card, ErrorText } from "@/components/erp/ui/fields";
import { SkeletonList } from "@/components/erp/ui/Loading";
import { EmptyState } from "@/components/erp/ui/DataTools";
import { StatusBadge } from "@/components/erp/tasks/TaskRow";

const TONE = { pending: "bg-amber-500/15 text-amber-200", applied: "bg-emerald-500/15 text-emerald-200", declined: "bg-red-500/15 text-red-300" };

// Every change the client asked for after approval: what, when, which tasks, and the
// extra hours and delay it cost. The CEO marks each free or paid.
export default function ProjectChanges({ projectId, onOpenTask }) {
  const { t, lang } = useLanguage();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const url = `/api/work-projects/${projectId}/client-changes`;
  const load = useCallback(() => {
    api(url)
      .then(setData)
      .catch((err) => setError(errorText(t, err)));
  }, [url, t]);
  useEffect(() => {
    load();
  }, [load]);

  const bill = (changeId, billing) =>
    api(url, { method: "PATCH", body: { changeId, billing } })
      .then(load)
      .catch((err) => setError(errorText(t, err)));

  const applied = (data?.changes || []).filter((c) => c.status === "applied");
  return (
    <div className="space-y-4">
      <ErrorText>{error}</ErrorText>
      {!data && !error && <SkeletonList rows={3} avatar={false} />}
      {data?.changes.length === 0 && <EmptyState compact text={t("erp.clientChange.none")} />}
      {applied.length > 0 && <p className="text-sm text-white/70">{t("erp.clientChange.total", { n: applied.length, h: applied.reduce((n, c) => n + c.extraHours, 0) })}</p>}
      {data?.changes.map((c) => (
        <Card key={c.id} className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <b dir="ltr">{c.code}</b>
            <span className={`rounded-full px-2.5 py-0.5 text-xs ${TONE[c.status]}`}>{t(`erp.clientChange.status.${c.status}`)}</span>
            {c.billing !== undefined && c.status === "applied" && !data.canBill && <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs">{t(`erp.clientChange.bill.${c.billing || "later"}`)}</span>}
            <span className="ms-auto text-xs text-white/55">{formatDateTime(c.createdAt, lang)}</span>
          </div>
          <p className="whitespace-pre-wrap text-sm">{c.summary}</p>
          <p className="text-xs text-white/55">
            {t("erp.clientChange.by", { name: c.requestedBy })}
            {c.decidedBy && ` · ${t("erp.clientChange.decidedBy", { name: c.decidedBy })}`}
            {c.declineReason && ` · ${c.declineReason}`}
          </p>
          {c.status === "applied" && (
            <>
              <p className="flex flex-wrap gap-x-4 text-xs text-white/75">
                <span>{t("erp.clientChange.extraHours", { h: c.extraHours })}</span>
                {c.deliveryTo && (
                  <span>
                    {t("erp.clientChange.delivery")}: {c.deliveryFrom ? formatDate(c.deliveryFrom, lang) : "—"} → {formatDate(c.deliveryTo, lang)}
                    {c.delayHours ? ` (${t("erp.clientChange.delay", { h: c.delayHours })})` : ""}
                  </span>
                )}
              </p>
              <ul className="space-y-1 text-xs">
                {c.items.map((i) => (
                  <li key={i.task} className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => onOpenTask(i.task)} className="text-sky-300 hover:underline">
                      #{i.number}
                    </button>
                    <span className="text-white/65">{t(`erp.clientChange.action.${i.action}`)}</span>
                    {i.newTask && (
                      <button type="button" onClick={() => onOpenTask(i.newTask)} className="text-sky-300 hover:underline">
                        → #{i.newNumber}
                      </button>
                    )}
                    {i.newStatus && <StatusBadge status={i.newStatus} />}
                  </li>
                ))}
              </ul>
              {data.canBill && (
                <div className="flex gap-1.5">
                  {["free", "paid"].map((k) => (
                    <button key={k} type="button" onClick={() => c.billing !== k && bill(c.id, k)} className={`rounded-lg px-3 py-1.5 text-xs ${c.billing === k ? "bg-brand-orange text-white" : "bg-white/5 text-white/65"}`}>
                      {t(`erp.clientChange.bill.${k}`)}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {c.status === "pending" && (
            <button type="button" onClick={() => onOpenTask(c.taskId)} className="text-xs text-brand-orange hover:underline">
              {t("erp.clientChange.openTask")}
            </button>
          )}
        </Card>
      ))}
    </div>
  );
}
