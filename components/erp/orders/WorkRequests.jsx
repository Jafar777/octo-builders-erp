"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDateTime } from "@/lib/formatTime";
import { Button, Card, ErrorText } from "@/components/erp/ui/fields";
import { EmptyState } from "@/components/erp/ui/DataTools";
import { SkeletonList } from "@/components/erp/ui/Loading";
import { useAsk } from "@/components/erp/ui/Feedback";
import { ordersChanged } from "@/components/erp/orders/ordersChanged";

const TONE = { pending: "text-amber-300", approved: "text-emerald-300", declined: "text-red-300", cancelled: "text-white/50" };

// Requests about starting work (lib/hybridServer.js): an employee's own, what waits for
// this person, and — for those who decide — what people started by themselves.
export default function WorkRequests({ decides = false, only = "" }) {
  const { t, lang } = useLanguage();
  const ask = useAsk();
  const [data, setData] = useState({});
  const [error, setError] = useState("");
  const load = useCallback(() => {
    const tabs = only ? [only] : ["mine", ...(decides ? ["queue", "activity"] : [])];
    Promise.all(tabs.map((tab) => api(`/api/work-requests?tab=${tab}`).then((d) => [tab, d])))
      .then((list) => setData(Object.fromEntries(list)))
      .catch((err) => setError(errorText(t, err)));
  }, [decides, only, t]);
  useEffect(() => {
    load();
  }, [load]);

  async function decide(r, decision) {
    const note = decision === "decline" ? await ask({ text: t("erp.hr.rejectReason"), danger: true }) : "";
    if (note === null) return;
    setError("");
    try {
      await api(`/api/work-requests/${r.id}`, { method: "PATCH", body: { decision, note } });
    } catch (err) {
      setError(errorText(t, err));
    }
    load();
    ordersChanged();
  }

  const row = (r) => (
    <Card key={r.id} className="space-y-2 !p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {!r.mine && <span className="font-medium">{r.by}</span>}
        <span>{t(`erp.workRequests.kind.${r.kind}`)}</span>
        <span className="text-white/60">{[r.project?.[lang] || r.project?.ar, r.stage?.[lang] || r.stage?.ar, r.title].filter(Boolean).join(" · ")}</span>
        {r.taskId && (
          <Link href={`/dashboard/tasks?task=${r.taskId}`} className="text-brand-orange hover:underline" dir="ltr">
            #{r.taskNumber}
          </Link>
        )}
        {r.kind === "hours" && <span className="text-white/70">{t("erp.workRequests.hours", { from: r.currentHours, to: r.hours })}</span>}
        <span className={`ms-auto text-xs ${TONE[r.status]}`}>{t(`erp.workRequests.status.${r.status}`)}</span>
      </div>
      {r.reason && <p className="text-sm text-white/70">{r.reason}</p>}
      {r.kind === "client" && r.canDecide && <p className="text-xs text-white/60">{t("erp.workRequests.clientHint")}</p>}
      {r.decidedBy && <p className="text-xs text-white/60">{[r.decidedBy, r.note].filter(Boolean).join(" — ")}</p>}
      <div className="flex flex-wrap gap-2">
        {r.canDecide && (
          <>
            <Button onClick={() => decide(r, "approve")}>
              <CheckCircle2 size={15} /> {t(r.kind === "client" ? "erp.workRequests.handled" : "erp.overtime.approve")}
            </Button>
            <Button variant="danger" onClick={() => decide(r, "decline")}>
              <XCircle size={15} /> {t("erp.overtime.reject")}
            </Button>
          </>
        )}
        {r.mine && r.status === "pending" && (
          <Button variant="ghost" onClick={() => decide(r, "cancel")}>
            {t("common.cancel")}
          </Button>
        )}
        {r.mine && r.createdId && (
          <Link href={`/dashboard/tasks?task=${r.createdId}`} className="text-sm text-brand-orange hover:underline">
            {t("erp.projects.openTask")} <span dir="ltr">#{r.createdNumber}</span>
          </Link>
        )}
      </div>
    </Card>
  );
  const section = (title, rows, empty) => (
    <section className="space-y-2">
      {!only && <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">{title}</h2>}
      {rows.map(row)}
      {!rows.length && <EmptyState compact text={empty} />}
    </section>
  );
  if (!Object.keys(data).length) return error ? <ErrorText>{error}</ErrorText> : <SkeletonList rows={3} />;
  const activity = data.activity;
  return (
    <div className="space-y-10">
      <ErrorText>{error}</ErrorText>
      {data.queue && section(t("erp.orders.tab.waiting"), data.queue.requests, t("erp.orders.nothing"))}
      {activity && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">{t("erp.workRequests.activity")}</h2>
          {activity.month.length > 0 && (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-xs text-white/60">
                  <tr>
                    {["person", "planned", "self", "pushed"].map((k) => (
                      <th key={k} className="px-2 py-2 text-start font-medium">
                        {t(`erp.workRequests.col.${k}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activity.month.map((m) => (
                    <tr key={m.name} className="border-t border-white/5">
                      <td className="px-2 py-2">{m.name}</td>
                      <td className="px-2 py-2 tabular-nums">{t("erp.workRequests.cell", { n: m.planned, h: m.plannedHours })}</td>
                      <td className="px-2 py-2 tabular-nums">{t("erp.workRequests.cell", { n: m.self, h: m.selfHours })}</td>
                      <td className="px-2 py-2 tabular-nums">{m.pushed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          {activity.recent.map((x) => (
            <Link key={x.id} href={`/dashboard/tasks?task=${x.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm hover:bg-white/5">
              <span dir="ltr" className="text-white/60">
                #{x.number}
              </span>
              <span className="font-medium">{x.assignee}</span>
              <span className="min-w-0 flex-1 truncate">{x.title}</span>
              <span className="text-white/60">{formatDateTime(x.at, lang)}</span>
              {x.pushed.length > 0 && <span className="basis-full text-xs text-amber-300">{t("erp.workRequests.pushedRow", { list: x.pushed.map((n) => `#${n}`).join(" · "), reason: x.reason })}</span>}
            </Link>
          ))}
          {!activity.recent.length && <EmptyState compact text={t("erp.workRequests.noActivity")} />}
        </section>
      )}
      {data.mine && section(t("erp.workRequests.mine"), data.mine.requests, t("erp.workRequests.none"))}
    </div>
  );
}
