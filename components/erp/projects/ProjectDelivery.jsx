"use client";

import { AlertTriangle, CheckCircle2, Flag, Play } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { formatDateTime } from "@/lib/formatTime";
import { Card } from "@/components/erp/ui/fields";
import { EmptyState } from "@/components/erp/ui/DataTools";

const HOUR = 3600000;

// "+12.5 h" / "−3 h" of working time; "" when it's under half an hour.
export function workDelta(t, ms) {
  if (ms === null || ms === undefined || Math.abs(ms) < HOUR / 2) return "";
  const n = Math.round((Math.abs(ms) / HOUR) * 10) / 10;
  return `${ms > 0 ? "+" : "−"}${t("erp.gantt.hours", { n })}`;
}

function Delta({ t, ms }) {
  const d = workDelta(t, ms);
  if (!d) return null;
  return (
    <span className={`ms-1 font-semibold ${ms > 0 ? "text-red-300" : "text-emerald-300"}`} dir="ltr">
      ({d})
    </span>
  );
}

// One line in the header: Baseline 1, the expected start and delivery now, and the delays.
export function DeliverySummary({ project }) {
  const { t, lang } = useLanguage();
  const first = project.baselines?.find((b) => b.n === 1);
  if (!first) return null;
  const d = project.delivery || {};
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="flex items-center gap-1 rounded-full bg-yellow-300/15 px-2.5 py-0.5 text-yellow-200">
        <Flag size={12} /> {t("erp.gantt.baseline", { n: 1 })}: {first.start ? `${formatDateTime(first.start, lang)} → ` : ""}
        {formatDateTime(first.end, lang)}
      </span>
      {project.forecastStart && (
        <span className="text-white/60">
          {t(d.started ? "erp.delivery.started" : "erp.delivery.expectedStart")}: {formatDateTime(project.forecastStart, lang)}
          <Delta t={t} ms={d.startVsFirstMs} />
        </span>
      )}
      {project.forecastEnd && (
        <span className="text-white/60">
          {t("erp.delivery.expected")}: {formatDateTime(project.forecastEnd, lang)}
          <Delta t={t} ms={d.vsFirstMs} />
        </span>
      )}
      {project.dueRisk && (
        <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-0.5 text-red-200">
          <AlertTriangle size={12} /> {t("erp.gantt.dueRisk")}
        </span>
      )}
    </span>
  );
}

// Working time each cause added (or saved) — the main reasons first.
function byCause(delays) {
  const sums = {};
  for (const x of delays) sums[x.cause] = (sums[x.cause] || 0) + (x.workMs || 0);
  return Object.entries(sums)
    .filter(([, ms]) => Math.abs(ms) >= HOUR / 2)
    .sort((a, b) => b[1] - a[1]);
}

function Reasons({ t, title, delays }) {
  const rows = byCause(delays);
  if (!rows.length) return null;
  const max = Math.max(...rows.map(([, ms]) => Math.abs(ms)));
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-white/60">{title}</p>
      {rows.map(([cause, ms]) => (
        <div key={cause} className="flex items-center gap-3 text-sm">
          <span className="min-w-0 flex-1 truncate text-white/75" title={t(`erp.delivery.cause.${cause}`, { n: "" })}>
            {t(`erp.delivery.causeShort.${cause}`)}
          </span>
          <span className="hidden h-2 w-32 overflow-hidden rounded-full bg-white/5 sm:block">
            <span className={`block h-full rounded-full ${ms > 0 ? "bg-red-400/70" : "bg-emerald-400/70"}`} style={{ width: `${(Math.abs(ms) / max) * 100}%` }} />
          </span>
          <span className={`w-20 shrink-0 text-end font-semibold tabular-nums ${ms > 0 ? "text-red-300" : "text-emerald-300"}`} dir="ltr">
            {workDelta(t, ms)}
          </span>
        </div>
      ))}
    </div>
  );
}

// The "Delivery" tab: every baseline, the expected start and delivery now, the main
// reasons they moved, and every move.
export default function ProjectDelivery({ project, onOpenTask }) {
  const { t, lang } = useLanguage();
  const baselines = [...(project.baselines || [])].sort((a, b) => a.n - b.n);
  const d = project.delivery || {};
  const delays = d.delays || [];

  if (!baselines.length) return <Card className="text-sm text-white/50">{t("erp.delivery.noBaseline")}</Card>;

  const late = d.vsFirstMs > HOUR / 2;
  const lateStart = d.startVsFirstMs > HOUR / 2;
  const first = baselines[0];
  return (
    <div className="max-w-4xl space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="space-y-1">
          <p className="text-xs text-white/50">{t("erp.gantt.baseline", { n: 1 })}</p>
          {first.start && (
            <p className="text-sm text-yellow-100/80">
              {t("erp.delivery.startShort")}: {formatDateTime(first.start, lang)}
            </p>
          )}
          <p className="font-semibold text-yellow-200">
            {t("erp.delivery.endShort")}: {formatDateTime(first.end, lang)}
          </p>
          <p className="text-[11px] text-white/60">{t("erp.delivery.savedAt", { at: formatDateTime(first.at, lang) })}</p>
        </Card>
        <Card className="space-y-1">
          <p className="text-xs text-white/50">{t("erp.delivery.now")}</p>
          {d.forecastStart && (
            <p className="text-sm">
              {t(d.started ? "erp.delivery.started" : "erp.delivery.expectedStart")}: {formatDateTime(d.forecastStart, lang)}
              {first.start && (
                <span className={`block text-xs ${lateStart ? "text-red-300" : "text-emerald-300"}`}>
                  {lateStart ? t("erp.delivery.startLateBy", { d: workDelta(t, d.startVsFirstMs) }) : t("erp.delivery.startOnTime")}
                </span>
              )}
            </p>
          )}
          <p className="font-semibold">
            {t("erp.delivery.expected")}: {formatDateTime(d.forecastEnd, lang)}
          </p>
          <p className={`flex items-center gap-1 text-xs ${late ? "text-red-300" : "text-emerald-300"}`}>
            {late ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
            {late ? t("erp.delivery.lateBy", { d: workDelta(t, d.vsFirstMs) }) : t("erp.delivery.onTime")}
          </p>
        </Card>
        <Card className="space-y-1">
          <p className="text-xs text-white/50">{t("erp.delivery.baselines")}</p>
          <ul className="space-y-0.5 text-xs">
            {baselines.map((b) => (
              <li key={b.n} className="flex justify-between gap-2">
                <span className={b.n === 1 ? "text-yellow-200" : "text-orange-300"}>{t("erp.gantt.baseline", { n: b.n })}</span>
                <span className="text-end text-white/70">
                  {b.start && <span className="block text-white/60">{formatDateTime(b.start, lang)} →</span>}
                  {formatDateTime(b.end, lang)}
                </span>
              </li>
            ))}
          </ul>
          {d.vsLastMs !== null && d.vsLastMs !== undefined && workDelta(t, d.vsLastMs) && (
            <p className="text-[11px] text-white/60">{t("erp.delivery.vsLast", { d: workDelta(t, d.vsLastMs) })}</p>
          )}
        </Card>
      </div>

      {byCause(delays).length > 0 && (
        <Card className="space-y-4">
          <p className="text-sm font-semibold">{t("erp.delivery.mainReasons")}</p>
          <Reasons t={t} title={t("erp.delivery.reasonsEnd")} delays={delays.filter((x) => x.field !== "start")} />
          <Reasons t={t} title={t("erp.delivery.reasonsStart")} delays={delays.filter((x) => x.field === "start")} />
        </Card>
      )}

      <Card className="p-0">
        <p className="border-b border-white/10 px-4 py-3 text-sm font-semibold">{t("erp.delivery.why")}</p>
        {!delays.length && <EmptyState compact text={t("erp.delivery.noChanges")} />}
        <ul className="divide-y divide-white/5">
          {delays.map((x) => {
            const later = x.workMs > 0 || (x.workMs === 0 && new Date(x.to) > new Date(x.from));
            return (
              <li key={x.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-sm">
                <span className={`w-20 shrink-0 font-semibold ${later ? "text-red-300" : "text-emerald-300"}`} dir="ltr">
                  {workDelta(t, x.workMs) || (later ? "+" : "−")}
                </span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p>
                    <span className={`me-2 inline-flex items-center gap-1 rounded px-1.5 py-px text-[11px] font-semibold uppercase ${x.field === "start" ? "bg-sky-400/15 text-sky-200" : "bg-white/10 text-white/60"}`}>
                      {x.field === "start" && <Play size={9} />}
                      {t(x.field === "start" ? "erp.delivery.startShort" : "erp.delivery.endShort")}
                    </span>
                    {t(`erp.delivery.cause.${x.cause}`, { n: x.taskNumber ?? "" })}
                    {x.taskId && (
                      <button type="button" onClick={() => onOpenTask(x.taskId)} className="ms-2 text-xs text-brand-orange hover:underline" dir="ltr">
                        #{x.taskNumber}
                      </button>
                    )}
                  </p>
                  {x.taskProject && <p className="text-xs text-white/50">{t("erp.delivery.otherProject", { p: x.taskProject })}</p>}
                  {x.note && <p className="text-xs text-white/50" dir="auto">“{x.note}”</p>}
                  <p className="text-[11px] text-white/60">
                    {formatDateTime(x.from, lang)} → {formatDateTime(x.to, lang)}
                  </p>
                </div>
                <span className="shrink-0 text-end text-[11px] text-white/60">
                  {formatDateTime(x.at, lang)}
                  {x.by && <span className="block">{x.by}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
