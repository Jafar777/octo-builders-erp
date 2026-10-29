"use client";

import { useCallback, useEffect, useState } from "react";
import { Briefcase, CalendarClock, ClipboardCheck, Cpu, Plus, Settings2, Trash2, UserCheck, Users } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDateTime } from "@/lib/formatTime";
import BilingualField from "@/components/dashboard/BilingualField";
import Avatar from "@/components/erp/ui/Avatar";
import { Button, Card, ErrorText, Input, Label, PageHeader } from "@/components/erp/ui/fields";
import { MonthPicker } from "@/components/erp/hr/hrUi";
import { SkeletonCards } from "@/components/erp/ui/Loading";
import Stars from "@/components/erp/tasks/Stars";
import { useTaskLookups } from "@/components/erp/tasks/useTaskLookups";
import { TEAM_METRICS } from "@/lib/kpi/hybrid";

const tone = (v) => (v === null || v === undefined ? "text-white/40" : v >= 80 ? "text-emerald-300" : v >= 60 ? "text-amber-200" : "text-red-300");

function Bar({ label, value }) {
  return (
    <div>
      <div className="mb-1 flex justify-between gap-2 text-xs">
        <span className="truncate text-white/60">{label}</span>
        <span className={`tabular-nums ${tone(value)}`}>{value ?? "—"}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-sky-400/70" style={{ width: `${Math.min(100, value || 0)}%` }} />
      </div>
    </div>
  );
}

// The GM / CEO rating of one manager (1–5 per criterion + note).
function RatingForm({ manager, criteria, month, onSaved }) {
  const { t, lang } = useLanguage();
  const [scores, setScores] = useState(() => ({ ...(manager.rating?.scores || {}) }));
  const [note, setNote] = useState(manager.rating?.note || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const complete = criteria.every((c) => scores[c.key] >= 1);

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("/api/manager-kpi", { method: "PUT", body: { month, userId: manager.id, scores, note } });
      onSaved();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {criteria.map((c) => (
        <div key={c.key} className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-white/75">{c.name?.[lang]}</span>
          <Stars value={scores[c.key] || 0} onChange={(v) => setScores((s) => ({ ...s, [c.key]: v }))} size={18} />
        </div>
      ))}
      <textarea
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("erp.managerKpi.notePlaceholder")}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/30"
      />
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} loading={busy} disabled={!complete}>
          {t(manager.rating ? "erp.managerKpi.update" : "erp.managerKpi.save")}
        </Button>
        {!complete && <span className="text-xs text-white/45">{t("erp.managerKpi.rateAll")}</span>}
      </div>
    </div>
  );
}

// The GM / CEO set a head's management share (empty = the company default).
function ShareForm({ manager, data, onSaved }) {
  const { t } = useLanguage();
  const [value, setValue] = useState(manager.share === null ? "" : String(manager.share));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(share) {
    setBusy(true);
    setError("");
    try {
      await api("/api/manager-kpi", { method: "PATCH", body: { userId: manager.id, share } });
      onSaved();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="w-32">
        <Input type="number" min="0" max="100" label={t("erp.managerKpi.shareLabel")} value={value} onChange={setValue} dir="ltr" placeholder={String(data.managementShare)} />
      </div>
      <Button variant="ghost" onClick={() => save(value === "" ? null : Number(value))} loading={busy}>
        {t("common.save")}
      </Button>
      {manager.share !== null && (
        <Button variant="ghost" onClick={() => save(null)} disabled={busy}>
          {t("erp.managerKpi.useDefault", { n: data.managementShare })}
        </Button>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

function ManagerCard({ manager, data, month, departmentName, onSaved }) {
  const { t, lang } = useLanguage();
  const k = manager.kpi;
  const a = manager.attendance;
  const h = k?.hybrid;
  const w = h ? h.ratingWeight : data.weight;
  const editable = data.canRate && !data.closed;
  const attendanceInd = k?.indicators.find((i) => i.key === "attendance");

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar name={manager.name} src={manager.avatarUrl} size={44} />
          <div>
            <p className="font-semibold">{manager.name}</p>
            <p className="text-xs text-white/45">{departmentName(manager.department)}</p>
          </div>
        </div>
        <div className="text-end">
          <p className="text-xs text-white/45">{t("erp.managerKpi.final")}</p>
          <p className={`text-3xl font-bold tabular-nums ${tone(k?.score)}`}>{k ? k.score : "—"}</p>
          {k && (
            <p className="text-xs text-white/50">
              {k.grade?.[lang]} · {t("erp.kpi.rank")} {k.rank}/{k.of}
            </p>
          )}
        </div>
      </div>

      {!k ? (
        <p className="rounded-xl bg-white/5 px-4 py-3 text-sm text-white/55">{t("erp.managerKpi.noKpi")}</p>
      ) : (
        <>
          {/* How the final score is made */}
          {h ? (
            <div className="space-y-3 rounded-xl bg-white/[0.04] px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2" dir="ltr">
                <span className="flex items-center gap-1.5 text-violet-200">
                  <Users size={14} /> {h.management ?? "—"}
                </span>
                <span className="text-white/40">× {h.managementWeight}% +</span>
                <span className="flex items-center gap-1.5 text-sky-200">
                  <Briefcase size={14} /> {h.execution ?? "—"}
                </span>
                <span className="text-white/40">× {h.executionWeight}% =</span>
                <span className={`font-semibold ${tone(k.score)}`}>{k.score}</span>
              </div>
              <p className="text-xs text-white/55">
                {t("erp.managerKpi.shareLine", { share: h.share, kind: t(manager.share === null ? "erp.managerKpi.shareDefault" : "erp.managerKpi.shareOwn") })}
                {h.measuredShare !== null && <> · {t("erp.managerKpi.measured", { n: h.measuredShare })}</>}
                {h.management !== null && h.execution !== null && h.managementWeight !== h.share && <> · {t("erp.managerKpi.fewTasks")}</>}
              </p>
              {editable && <ShareForm key={`${manager.id}-${manager.share}`} manager={manager} data={data} onSaved={onSaved} />}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white/[0.04] px-4 py-2.5 text-sm" dir="ltr">
              <span className="flex items-center gap-1.5 text-sky-200">
                <Cpu size={14} /> {k.systemScore}
              </span>
              <span className="text-white/40">× {100 - w}% +</span>
              <span className="flex items-center gap-1.5 text-amber-200">
                <UserCheck size={14} /> {k.manualScore ?? "?"}
              </span>
              <span className="text-white/40">× {w}% =</span>
              <span className={`font-semibold ${tone(k.score)}`}>{k.score}</span>
            </div>
          )}

          {/* Management: the team's results (from the plan and reviews) */}
          {h && (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm font-medium text-violet-200">
                <Users size={15} /> {t("erp.managerKpi.managementPart")} · <span className="tabular-nums">{h.management ?? "—"}</span>
                <span className="text-xs font-normal text-white/45">
                  {t("erp.managerKpi.teamLine", { n: h.teamSize, team: h.teamScore ?? "—", rw: 100 - h.ratingWeight, w: h.ratingWeight })}
                </span>
              </p>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {TEAM_METRICS.map((m) => (
                  <Bar key={m} label={`${t(`erp.managerKpi.metric.${m}`)} · ${data.teamWeights?.[m] ?? 0}%`} value={h.metrics?.[m] ?? null} />
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            {/* System part: attendance (mandatory) + tasks */}
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm font-medium text-sky-200">
                {h ? <Briefcase size={15} /> : <Cpu size={15} />}
                {h ? t("erp.managerKpi.executionPart") : t("erp.managerKpi.systemPart", { n: 100 - w })} · <span className="tabular-nums">{k.systemScore}</span>
              </p>
              {a && (
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 p-3 text-xs sm:grid-cols-4">
                  <span>
                    <span className="block text-white/45">{t("erp.managerKpi.worked")}</span>
                    <span className="tabular-nums" dir="ltr">
                      {Math.round(a.workedHours)} / {Math.round(a.requiredHours)}h
                    </span>
                  </span>
                  <span>
                    <span className="block text-white/45">{t("erp.managerKpi.present")}</span>
                    {a.presentDays}
                  </span>
                  <span>
                    <span className="block text-white/45">{t("erp.managerKpi.absent")}</span>
                    <span className={a.absentDays ? "text-red-300" : ""}>{a.absentDays}</span>
                  </span>
                  <span>
                    <span className="block text-white/45">{t("erp.managerKpi.late")}</span>
                    <span className={a.lateCount ? "text-amber-200" : ""}>{a.lateCount}</span>
                  </span>
                </div>
              )}
              <div className="space-y-2.5">
                {k.indicators.map((i) => (
                  <Bar key={i.key} label={`${i.name?.[lang]}${i === attendanceInd ? ` · ${t("erp.managerKpi.mandatory")}` : ""}`} value={i.percent} />
                ))}
              </div>
            </div>

            {/* Manual part: the GM / CEO rating */}
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm font-medium text-amber-200">
                <UserCheck size={15} /> {h ? t("erp.managerKpi.ratingPart", { n: w }) : t("erp.managerKpi.manualPart", { n: w })} ·{" "}
                <span className="tabular-nums">{manager.rating?.percent ?? "—"}</span>
              </p>
              {editable ? (
                <RatingForm key={`${manager.id}-${month}-${manager.rating?.updatedAt || ""}`} manager={manager} criteria={data.criteria} month={month} onSaved={onSaved} />
              ) : manager.rating ? (
                <div className="space-y-2.5">
                  {data.criteria.map((c) => (
                    <div key={c.key} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-white/75">{c.name?.[lang]}</span>
                      <Stars value={manager.rating.scores[c.key] || 0} />
                    </div>
                  ))}
                  {manager.rating.note && <p className="whitespace-pre-line rounded-xl bg-white/5 px-3 py-2 text-sm text-white/75">{manager.rating.note}</p>}
                </div>
              ) : (
                <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{t("erp.managerKpi.waitingRating")}</p>
              )}
              {manager.rating?.ratedBy && (
                <p className="text-[11px] text-white/40">
                  {t("erp.managerKpi.ratedBy", { name: manager.rating.ratedBy })} · {formatDateTime(manager.rating.updatedAt, lang)}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

// GM / CEO: the rating's weight and its criteria (Settings key "managerKpi").
function ManagerKpiSettings({ weight, criteria, managementShare, ratingWeight, teamWeights, onSaved }) {
  const { t } = useLanguage();
  const [value, setValue] = useState({
    weight: String(weight),
    criteria,
    managementShare: String(managementShare),
    ratingWeight: String(ratingWeight),
    teamWeights: Object.fromEntries(TEAM_METRICS.map((m) => [m, String(teamWeights?.[m] ?? 0)])),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const setCriterion = (i, patch) => setValue((v) => ({ ...v, criteria: v.criteria.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("/api/settings", {
        method: "PUT",
        body: {
          key: "managerKpi",
          value: {
            weight: Number(value.weight),
            criteria: value.criteria,
            managementShare: Number(value.managementShare),
            ratingWeight: Number(value.ratingWeight),
            teamWeights: Object.fromEntries(TEAM_METRICS.map((m) => [m, Number(value.teamWeights[m]) || 0])),
          },
        },
      });
      onSaved();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <p className="flex items-center gap-2 font-semibold">
        <Settings2 size={16} /> {t("erp.managerKpi.settings")}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          type="number"
          min="0"
          max="100"
          label={t("erp.managerKpi.defaultShare")}
          value={value.managementShare}
          onChange={(n) => setValue((v) => ({ ...v, managementShare: n }))}
          dir="ltr"
        />
        <Input type="number" min="0" max="100" label={t("erp.managerKpi.ratingWeight")} value={value.ratingWeight} onChange={(n) => setValue((v) => ({ ...v, ratingWeight: n }))} dir="ltr" />
      </div>
      <div>
        <Label>{t("erp.managerKpi.teamWeights")}</Label>
        <div className="grid gap-2 sm:grid-cols-3">
          {TEAM_METRICS.map((m) => (
            <Input
              key={m}
              type="number"
              min="0"
              max="100"
              label={t(`erp.managerKpi.metric.${m}`)}
              value={value.teamWeights[m]}
              onChange={(n) => setValue((v) => ({ ...v, teamWeights: { ...v.teamWeights, [m]: n } }))}
              dir="ltr"
            />
          ))}
        </div>
        <p className="mt-1 text-xs text-white/40">{t("erp.managerKpi.teamWeightsHint")}</p>
      </div>
      <div>
        <Label>{t("erp.managerKpi.criteria")}</Label>
        <div className="space-y-2">
          {value.criteria.map((c, i) => (
            <div key={i} className="grid items-end gap-2 rounded-xl border border-white/10 p-3 sm:grid-cols-[140px_1fr_auto]">
              <Input label={t("erp.settings.code")} value={c.key} dir="ltr" onChange={(key) => setCriterion(i, { key })} />
              <BilingualField label={t("erp.org.name")} value={c.name} onChange={(name) => setCriterion(i, { name })} />
              <button
                type="button"
                onClick={() => setValue((v) => ({ ...v, criteria: v.criteria.filter((_, j) => j !== i) }))}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-500/30 text-red-400"
                aria-label={t("common.delete")}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <Button variant="ghost" onClick={() => setValue((v) => ({ ...v, criteria: [...v.criteria, { key: "", name: { ar: "", en: "" } }] }))}>
            <Plus size={16} /> {t("erp.managerKpi.addCriterion")}
          </Button>
        </div>
      </div>
      <p className="text-xs text-white/40">{t("erp.managerKpi.settingsHint")}</p>
      <ErrorText>{error}</ErrorText>
      <Button onClick={save} loading={busy}>
        {t("common.save")}
      </Button>
    </Card>
  );
}

export default function ManagerKpiPage({ initialMonth }) {
  const { t } = useLanguage();
  const lookups = useTaskLookups();
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await api(`/api/manager-kpi?month=${month}`));
    } catch (err) {
      setError(errorText(t, err));
    }
  }, [month, t]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return (
    <div className="max-w-6xl">
      <PageHeader
        title={t("erp.nav.managerKpi")}
        subtitle={t("erp.managerKpi.subtitle")}
        actions={
          <>
            <MonthPicker month={month} onChange={setMonth} />
            {data?.canRate && (
              <Button variant="ghost" onClick={() => setShowSettings((s) => !s)}>
                <Settings2 size={16} /> {t("erp.managerKpi.settings")}
              </Button>
            )}
          </>
        }
      />
      <ErrorText>{error}</ErrorText>
      {!data && !error && <SkeletonCards count={3} />}

      {data && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm">
            <span className="flex items-center gap-2 text-violet-200">
              <Users size={15} /> {t("erp.managerKpi.formulaManagement", { n: data.managementShare })}
            </span>
            <span className="flex items-center gap-2 text-sky-200">
              <Briefcase size={15} /> {t("erp.managerKpi.formulaExecution", { n: 100 - data.managementShare })}
            </span>
            <span className="flex items-center gap-2 text-amber-200">
              <UserCheck size={15} /> {t("erp.managerKpi.formulaRating", { n: data.ratingWeight })}
            </span>
            <span className="flex items-center gap-2 text-white/55">
              <CalendarClock size={15} /> {t("erp.managerKpi.formulaAttendance")}
            </span>
            {data.closed && (
              <span className="flex items-center gap-2 text-white/45">
                <ClipboardCheck size={15} /> {t("erp.hr.closed")}
              </span>
            )}
          </div>

          {showSettings && data.canRate && (
            <ManagerKpiSettings
              key={`${data.weight}-${data.managementShare}-${data.ratingWeight}-${data.criteria.map((c) => c.key).join()}`}
              weight={data.weight}
              criteria={data.criteria}
              managementShare={data.managementShare}
              ratingWeight={data.ratingWeight}
              teamWeights={data.teamWeights}
              onSaved={() => {
                setShowSettings(false);
                load();
              }}
            />
          )}

          {data.managers.map((m) => (
            <ManagerCard key={m.id} manager={m} data={data} month={month} departmentName={lookups.departmentName} onSaved={load} />
          ))}
          {data.managers.length === 0 && <Card className="text-center text-white/50">{t("erp.managerKpi.none")}</Card>}
        </div>
      )}
    </div>
  );
}
