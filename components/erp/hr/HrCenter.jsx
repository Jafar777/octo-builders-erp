"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import { Copy, Gift, Lock, LockOpen, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDateTime } from "@/lib/formatTime";
import Avatar from "@/components/erp/ui/Avatar";
import Modal from "@/components/erp/ui/Modal";
import { Button, Card, ErrorText, Input, PageHeader, Select, Toggle } from "@/components/erp/ui/fields";
import { hm, money, MonthPicker } from "@/components/erp/hr/hrUi";
import PersonMonth from "@/components/erp/hr/PersonMonth";
import LeaveList from "@/components/erp/hr/LeaveList";
import SalaryUnlock from "@/components/erp/hr/SalaryUnlock";
import { SkeletonList, SkeletonTable } from "@/components/erp/ui/Loading";

// Efficiency colour: actual (task) hours against fingerprint hours.
const effTone = (e) => (e === null || e === undefined ? "text-white/35" : e >= 0.8 ? "text-emerald-300" : e >= 0.6 ? "text-amber-200" : "text-red-300");

function Overview({ data, lookups, onOpen, payroll }) {
  const { t, lang } = useLanguage();
  const th = "px-3 py-3 font-medium whitespace-nowrap";
  const td = "px-3 py-3 tabular-nums whitespace-nowrap";
  // Numbers are written left-to-right inside, but cells keep the page direction so
  // they line up under their headers.
  const ltr = (v) => <span dir="ltr">{v}</span>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full min-w-[1000px] text-sm">
        <thead className="bg-white/[0.04] text-xs text-white/50">
          <tr>
            <th className={`${th} text-start`}>{t("auth.name")}</th>
            <th className={`${th} text-center`} title={t("erp.hr.workedHint")}>{t("erp.hr.worked")}</th>
            <th className={`${th} text-center`} title={t("erp.hr.actualHint")}>{t("erp.hr.actualHours")}</th>
            <th className={`${th} text-center`} title={t("erp.hr.efficiencyHint")}>{t("erp.hr.efficiency")}</th>
            <th className={`${th} text-center`}>{t("erp.hr.absent")}</th>
            <th className={`${th} text-center`}>{t("erp.hr.lateCount")}</th>
            <th className={`${th} text-center`}>{t("erp.hr.warnings")}</th>
            <th className={`${th} text-center`}>{t("erp.hr.overtime")}</th>
            <th className={`${th} text-center`}>KPI</th>
            {payroll && <th className={`${th} text-end`}>{t("erp.hr.pay.net")}</th>}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => {
            const s = r.summary;
            const exempt = r.staff.attendanceExempt;
            const dash = <span className="text-white/30">—</span>;
            return (
              <tr key={r.staff.id} onClick={() => onOpen(r.staff)} className="cursor-pointer border-t border-white/5 hover:bg-white/[0.04]">
                <td className="px-3 py-3">
                  <span className="flex items-center gap-2.5">
                    <Avatar name={r.staff.name} src={r.staff.avatarUrl} size={32} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.staff.name}</span>
                      <span className="block truncate text-xs text-white/40">
                        {lookups.dep(r.staff.department)}
                        {!r.staff.badgeId && !exempt && <span className="ms-1 text-amber-300">· {t("erp.hr.noBadge")}</span>}
                      </span>
                    </span>
                  </span>
                </td>
                {exempt ? (
                  <>
                    <td colSpan={2} className={`${td} text-center`}>
                      <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-white/50">{t("erp.hr.day.exempt")}</span>
                    </td>
                    <td className={`${td} text-center`}>{dash}</td>
                    <td className={`${td} text-center`}>{dash}</td>
                    <td className={`${td} text-center`}>{dash}</td>
                    <td className={`${td} text-center`}>{dash}</td>
                    <td className={`${td} text-center`}>{dash}</td>
                  </>
                ) : (
                  <>
                    <td className={`${td} text-center`}>
                      {s ? (
                        <>
                          {ltr(hm(s.workedHours))} <span className="text-white/35">/ {ltr(hm(s.requiredToDate))}</span>
                        </>
                      ) : (
                        dash
                      )}
                    </td>
                    <td className={`${td} text-center font-medium text-sky-200`}>{s ? ltr(hm(s.actualHours || 0)) : dash}</td>
                    <td className={`${td} text-center font-medium ${effTone(s?.efficiency)}`}>
                      {s?.efficiency === null || s?.efficiency === undefined ? dash : ltr(`${Math.round(s.efficiency * 100)}%`)}
                    </td>
                    <td className={`${td} text-center ${s?.absentDays ? "text-red-300" : ""}`}>{s?.absentDays ?? "—"}</td>
                    <td className={`${td} text-center ${s?.lateCount ? "text-amber-200" : ""}`}>{s?.lateCount ?? "—"}</td>
                    <td className={`${td} text-center ${s?.warnings >= 4 ? "text-red-300" : ""}`}>{s?.warnings ?? "—"}</td>
                    <td className={`${td} text-center`}>{s ? ltr(hm(s.overtimeHours)) : dash}</td>
                  </>
                )}
                <td className={`${td} text-center`}>
                  {r.kpi ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-semibold">{r.kpi.score}</span>
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-white/60">{r.kpi.grade?.[lang] || ""}</span>
                    </span>
                  ) : (
                    dash
                  )}
                </td>
                {payroll && (
                  <td className={`${td} text-end`}>
                    {r.payroll?.hasSalary ? money(r.payroll.net, r.payroll.currency, lang) : <span className="text-xs text-white/35">{t("erp.hr.noSalary")}</span>}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PayrollPanel({ data, month, onChanged, settings }) {
  const { t, lang } = useLanguage();
  const [error, setError] = useState("");
  const closed = data.state.closed;

  async function act(action) {
    if (!window.confirm(t(action === "close" ? "erp.hr.confirmClose" : "erp.hr.confirmReopen"))) return;
    setError("");
    try {
      await api(`/api/hr/months/${month}`, { method: "POST", body: { action } });
      onChanged();
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  const totals = {};
  for (const r of data.rows) if (r.payroll?.hasSalary) totals[r.payroll.currency] = (totals[r.payroll.currency] || 0) + r.payroll.net;

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center gap-4">
        {/* The KPI bonus is managed on the Bonus page only. */}
        <Link href="/dashboard/bonus" className="inline-flex items-center gap-1.5 text-sm text-amber-200 hover:underline">
          <Gift size={15} /> {t("erp.hr.bonusOnBonusPage")}
        </Link>
        <div className="ms-auto flex items-center gap-3">
          {Object.entries(totals).map(([c, v]) => (
            <span key={c} className="text-sm text-white/70">
              {t("erp.hr.totalNet")}: <span className="font-semibold text-white">{money(v, c, lang)}</span>
            </span>
          ))}
          {closed ? (
            <Button variant="ghost" onClick={() => act("reopen")}>
              <LockOpen size={16} /> {t("erp.hr.reopen")}
            </Button>
          ) : (
            <Button onClick={() => act("close")}>
              <Lock size={16} /> {t("erp.hr.closeMonth")}
            </Button>
          )}
        </div>
      </Card>
      {closed && <p className="text-sm text-white/55">{t("erp.hr.closedNote", { at: formatDateTime(data.state.closedAt, lang) })}</p>}
      <ErrorText>{error}</ErrorText>
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-white/[0.04] text-xs text-white/50">
            <tr>
              {["name", "base", "hoursDeduction", "warningDeduction", "overtimePay", "manualBonus", "kpiBonus", "net"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-start font-medium">
                  {h === "name" ? t("auth.name") : t(`erp.hr.pay.${h}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => {
              const p = r.payroll;
              const c = p?.currency || "USD";
              return (
                <tr key={r.staff.id} className="border-t border-white/5">
                  <td className="px-3 py-2.5 font-medium">{r.staff.name}</td>
                  {p?.hasSalary ? (
                    <>
                      <td className="px-3 py-2.5 tabular-nums">{money(p.base, c, lang)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-red-300">{p.hoursDeduction ? `-${money(p.hoursDeduction, c, lang)}` : "—"}</td>
                      <td className="px-3 py-2.5 tabular-nums text-red-300">{p.warningDeduction ? `-${money(p.warningDeduction, c, lang)} (${p.warningPercent}%)` : "—"}</td>
                      <td className="px-3 py-2.5 tabular-nums text-emerald-300">{p.overtimePay ? money(p.overtimePay, c, lang) : "—"}</td>
                      <td className="px-3 py-2.5 tabular-nums">{p.manualBonus ? money(p.manualBonus, c, lang) : "—"}</td>
                      <td className="px-3 py-2.5 tabular-nums">{p.kpiBonus ? money(p.kpiBonus, c, lang) : "—"}</td>
                      <td className="px-3 py-2.5 font-semibold tabular-nums">{money(p.net, c, lang)}</td>
                    </>
                  ) : (
                    <td colSpan={7} className="px-3 py-2.5 text-white/40">{t("erp.hr.noSalary")}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Devices() {
  const { t, lang } = useLanguage();
  const [devices, setDevices] = useState(null);
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState(null);
  const [error, setError] = useState("");
  // Time of the last refresh, used to judge "online" (heartbeat within 10 minutes).
  const [checkedAt, setCheckedAt] = useState(0);
  const load = useCallback(
    () =>
      api("/api/hr/devices")
        .then((d) => {
          setDevices(d.devices);
          setCheckedAt(Date.now());
        })
        .catch(() => {}),
    []
  );
  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setError("");
    try {
      const d = await api("/api/hr/devices", { method: "POST", body: { name } });
      setNewKey(d.key);
      setName("");
      load();
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  const online = (d) => d.lastSeenAt && checkedAt - new Date(d.lastSeenAt).getTime() < 10 * 60000;

  return (
    <div className="max-w-3xl space-y-5">
      <p className="text-sm text-white/60">{t("erp.hr.devicesHint")}</p>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input label={t("erp.hr.deviceName")} value={name} onChange={setName} placeholder="ZKTeco — Damascus office" />
        </div>
        <Button onClick={create} disabled={!name.trim()}>
          <Plus size={16} /> {t("common.add")}
        </Button>
      </div>
      {newKey && (
        <div className="space-y-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
          <p className="text-sm font-medium">{t("erp.hr.keyOnce")}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-black/30 px-3 py-2 text-xs" dir="ltr">{newKey}</code>
            <Button variant="ghost" onClick={() => navigator.clipboard?.writeText(newKey)}>
              <Copy size={15} />
            </Button>
          </div>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
      {!devices && <SkeletonList rows={2} />}
      {(devices || []).map((d) => (
        <Card key={d.id} className="flex flex-wrap items-center gap-4">
          <span className={`flex items-center gap-2 text-sm ${online(d) ? "text-emerald-300" : "text-amber-300"}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${online(d) ? "bg-emerald-400" : "bg-amber-400"}`} />
            {online(d) ? t("erp.hr.deviceOnline") : t("erp.hr.deviceOffline")}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{d.name}</p>
            <p className="text-xs text-white/45">
              …{d.keyHint} · {t("erp.hr.lastSeen")}: {d.lastSeenAt ? formatDateTime(d.lastSeenAt, lang) : "—"}
              {d.lastError && <span className="text-red-300"> · {d.lastError}</span>}
            </p>
          </div>
          <Toggle checked={d.active} onChange={(active) => api(`/api/hr/devices/${d.id}`, { method: "PATCH", body: { active } }).then(load)} label={t("erp.org.active")} />
          <button
            type="button"
            onClick={() => window.confirm(t("common.confirmDelete")) && api(`/api/hr/devices/${d.id}`, { method: "DELETE" }).then(load)}
            className="text-red-400"
            aria-label={t("common.delete")}
          >
            <Trash2 size={16} />
          </button>
        </Card>
      ))}
    </div>
  );
}

function Rules({ settings, onSaved }) {
  const { t } = useLanguage();
  const [value, setValue] = useState(settings.hr);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const set = (f) => (v) => setValue((x) => ({ ...x, [f]: v }));

  async function save() {
    setError("");
    setStatus("");
    try {
      await api("/api/settings", { method: "PUT", body: { key: "hr", value } });
      setStatus(t("common.saved"));
      onSaved();
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  return (
    <Card className="max-w-3xl space-y-5">
      <Input label={t("erp.hr.timezone")} value={value.timezone} onChange={set("timezone")} dir="ltr" />
      <div className="space-y-3">
        <Toggle checked={value.lateIsWarning} onChange={set("lateIsWarning")} label={t("erp.hr.rule.late")} />
        <Toggle checked={value.shortageIsWarning} onChange={set("shortageIsWarning")} label={t("erp.hr.rule.shortage")} />
        <Toggle checked={value.absenceIsWarning} onChange={set("absenceIsWarning")} label={t("erp.hr.rule.absence")} />
        <Toggle checked={value.deductMissingHours} onChange={set("deductMissingHours")} label={t("erp.hr.rule.deductHours")} />
        <Toggle checked={value.payOvertime} onChange={set("payOvertime")} label={t("erp.hr.rule.overtime")} />
      </div>
      <div className="space-y-3 border-t border-white/10 pt-4">
        <Toggle checked={value.salaryCode !== false} onChange={set("salaryCode")} label={t("erp.hr.rule.salaryCode")} />
        <Toggle checked={Boolean(value.webCheckIn)} onChange={set("webCheckIn")} label={t("erp.hr.rule.webCheckIn")} />
        <p className="text-xs text-white/40">{t("erp.hr.rule.webCheckInHint")}</p>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-white/70">{t("erp.hr.warningRules")}</p>
        {value.warningRules.map((r, i) => (
          <div key={i} className="mb-2 flex items-end gap-2">
            <Input type="number" label={t("erp.hr.fromWarnings")} value={r.count} dir="ltr" onChange={(v) => set("warningRules")(value.warningRules.map((x, j) => (j === i ? { ...x, count: Number(v) } : x)))} />
            <Input type="number" label={t("erp.hr.deductPercent")} value={r.percent} dir="ltr" onChange={(v) => set("warningRules")(value.warningRules.map((x, j) => (j === i ? { ...x, percent: Number(v) } : x)))} />
            <button type="button" onClick={() => set("warningRules")(value.warningRules.filter((_, j) => j !== i))} className="mb-2.5 text-red-400" aria-label={t("common.delete")}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <Button variant="ghost" onClick={() => set("warningRules")([...value.warningRules, { count: 6, percent: 20 }])}>
          <Plus size={16} /> {t("common.add")}
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
      {status && <p className="text-sm text-emerald-300">{status}</p>}
      <Button onClick={save}>{t("common.save")}</Button>
    </Card>
  );
}

const TABS = ["attendance", "leave", "payroll", "devices", "rules"];

export default function HrCenter({ initialMonth }) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(TABS.includes(searchParams.get("tab")) ? searchParams.get("tab") : "attendance");
  const [month, setMonth] = useState(/^\d{4}-\d{2}$/.test(searchParams.get("month") || "") ? searchParams.get("month") : initialMonth);
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [leaves, setLeaves] = useState(null);
  const router = useRouter();
  const [viewing, setViewing] = useState(null);
  const perms = useMemo(() => user?.permissions || [], [user]);
  // HR manages each employee (attendance, profile, salary, documents) from their file on
  // the staff page; department heads only get a read-only look at the month.
  const openPerson = (staff) => (perms.includes("attendance.manage") ? router.push(`/dashboard/staff?person=${staff.id}`) : setViewing(staff));
  // Older notifications link to /dashboard/hr?person=<id>.
  const personParam = searchParams.get("person");
  useEffect(() => {
    if (personParam && perms.includes("attendance.manage")) router.replace(`/dashboard/staff?person=${personParam}`);
  }, [personParam, perms, router]);

  const load = useCallback(() => {
    api(`/api/hr/overview?month=${month}`).then(setData).catch(() => {});
  }, [month]);
  const loadLeaves = useCallback(() => {
    if (perms.includes("leave.approve")) api("/api/leave?view=all").then((d) => setLeaves(d.leaves)).catch(() => setLeaves([]));
    else setLeaves([]);
  }, [perms]);
  const loadSettings = useCallback(() => api("/api/settings").then((d) => setSettings(d.settings)).catch(() => {}), []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLeaves();
    loadSettings();
    api("/api/messages/people").then((d) => setDepartments(d.departments)).catch(() => {});
  }, [loadLeaves, loadSettings]);

  const lookups = { dep: (id) => departments.find((d) => d.id === id)?.name?.[lang] || "—" };
  const visibleTabs = TABS.filter(
    (k) =>
      (k === "leave" && perms.includes("leave.approve")) ||
      (k === "payroll" && perms.includes("payroll.manage") && user?.scope === "all") ||
      (k === "devices" && perms.includes("attendance.manage") && user?.scope === "all") ||
      (k === "rules" && perms.includes("payroll.manage") && user?.scope === "all") ||
      k === "attendance"
  );
  const pending = (leaves || []).filter((l) => l.status === "pending").length;

  return (
    <div>
      <PageHeader title={t("erp.nav.hr")} subtitle={t("erp.hr.subtitle")} actions={(tab === "attendance" || tab === "payroll") && <MonthPicker month={month} onChange={setMonth} />} />
      <div className="relative mb-6 flex flex-wrap gap-1 border-b border-white/10">
        {visibleTabs.map((key) => (
          <button key={key} type="button" onClick={() => setTab(key)} className="relative px-4 py-3 text-sm font-medium text-white/60 data-[active=true]:text-white" data-active={tab === key}>
            {t(`erp.hr.tab.${key}`)}
            {key === "leave" && pending > 0 && <span className="ms-1.5 rounded-full bg-brand-orange px-1.5 text-[10px] text-white">{pending}</span>}
            {tab === key && <motion.span layoutId="hr-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-orange" />}
          </button>
        ))}
      </div>

      {tab === "attendance" &&
        (data ? (
          <div className="animate-fade-up space-y-4">
            {data.permissions.salaryLocked && <SalaryUnlock compact onUnlocked={load} />}
            <Overview data={data} lookups={lookups} onOpen={openPerson} payroll={data.permissions.payroll} />
          </div>
        ) : (
          <SkeletonTable rows={8} cols={7} />
        ))}
      {tab === "leave" && !leaves && <SkeletonList rows={5} />}
      {tab === "leave" && leaves && (
        <div className="animate-fade-up space-y-8">
          <LeaveList leaves={leaves.filter((l) => l.status === "pending")} approver onChanged={loadLeaves} />
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/45">{t("erp.hr.leaveHistory")}</h3>
            <LeaveList leaves={leaves.filter((l) => l.status !== "pending")} approver onChanged={loadLeaves} />
          </div>
        </div>
      )}
      {tab === "payroll" &&
        (!data || !settings ? (
          <SkeletonTable rows={8} cols={8} />
        ) : data.permissions.salaryLocked ? (
          <SalaryUnlock onUnlocked={load} />
        ) : (
          <PayrollPanel data={data} month={month} settings={settings} onChanged={load} />
        ))}
      {tab === "devices" && <Devices />}
      {tab === "rules" && settings && <Rules settings={settings} onSaved={() => { loadSettings(); load(); }} />}

      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing?.name || ""} wide>
        {viewing && <PersonMonth userId={viewing.id} month={month} />}
      </Modal>
    </div>
  );
}
