"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Lock } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatClock, locale } from "@/lib/formatTime";
import Modal from "@/components/erp/ui/Modal";
import { Button, ErrorText, Input, Select, Toggle } from "@/components/erp/ui/fields";
import { DAY_STYLE, hm, money, StatTile } from "@/components/erp/hr/hrUi";
import SalaryUnlock from "@/components/erp/hr/SalaryUnlock";
import { SkeletonCards, SkeletonTable, SkeletonText } from "@/components/erp/ui/Loading";

const OVERRIDE_STATUSES = ["", "present", "absent", "justified_absence", "annual_leave", "sick_leave", "unpaid_leave", "holiday", "weekend"];

function DayEditor({ day, userId, onSaved, onClose }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({ status: day.overridden ? day.status : "", exemptWarnings: day.exempt, bonus: day.bonus || "", note: day.note });
  const [punch, setPunch] = useState("");
  const [error, setError] = useState("");

  async function save() {
    setError("");
    try {
      await api("/api/hr/overrides", { method: "POST", body: { userId, date: day.date, ...form } });
      onSaved();
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  async function addPunch() {
    setError("");
    try {
      await api("/api/hr/punches", { method: "POST", body: { userId, time: new Date(`${day.date}T${punch}`).toISOString() } });
      setPunch("");
      onSaved(false);
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  return (
    <div className="space-y-4">
      <Select
        label={t("erp.hr.forceStatus")}
        value={form.status}
        onChange={(status) => setForm((f) => ({ ...f, status }))}
        options={OVERRIDE_STATUSES.map((s) => ({ value: s, label: s ? t(`erp.hr.day.${s}`) : t("erp.hr.automatic") }))}
      />
      <Toggle checked={form.exemptWarnings} onChange={(exemptWarnings) => setForm((f) => ({ ...f, exemptWarnings }))} label={t("erp.hr.exemptWarnings")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input type="number" min="0" label={t("erp.hr.bonus")} value={form.bonus} onChange={(bonus) => setForm((f) => ({ ...f, bonus }))} dir="ltr" />
        <Input label={t("erp.hr.note")} value={form.note} onChange={(note) => setForm((f) => ({ ...f, note }))} />
      </div>
      <Button onClick={save}>{t("common.save")}</Button>

      <div className="flex items-end gap-2 border-t border-white/10 pt-4">
        <div className="flex-1">
          <Input type="time" label={t("erp.hr.addPunch")} value={punch} onChange={setPunch} />
        </div>
        <Button variant="ghost" onClick={addPunch} disabled={!punch}>
          {t("common.add")}
        </Button>
      </div>
      <p className="text-xs text-white/40">{t("erp.hr.punchHint")}</p>
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}

// What was actually paid (typed in by payroll) against the calculated salary.
function ReceivedPay({ payroll, received, canRecord, userId, month, onSaved }) {
  const { t, lang } = useLanguage();
  const [amount, setAmount] = useState(received ? String(received.amount) : "");
  const [note, setNote] = useState(received?.note || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const c = received?.currency || payroll.currency;
  const diff = received ? received.amount - payroll.net : null;

  async function save(value) {
    setBusy(true);
    setError("");
    try {
      await api("/api/hr/payments", { method: "PUT", body: { userId, month, amount: value, currency: payroll.currency, note } });
      onSaved?.();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-2 border-t border-white/10 pt-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-white/70">{t("erp.hr.pay.received")}</span>
        <span className="font-semibold tabular-nums">{received ? money(received.amount, c, lang) : "—"}</span>
      </div>
      {diff !== null && Math.abs(diff) >= 0.005 && (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-white/50">{t("erp.hr.pay.receivedDiff")}</span>
          <span className={`tabular-nums ${diff > 0 ? "text-amber-200" : "text-red-300"}`} dir="ltr">
            {diff > 0 ? "+" : ""}
            {money(diff, c, lang)}
          </span>
        </div>
      )}
      {received?.note && <p className="text-xs text-white/45" dir="auto">“{received.note}”</p>}
      {canRecord && (
        <div className="space-y-2 pt-1">
          <div className="flex items-end gap-2">
            <div className="w-32">
              <Input type="number" min="0" step="0.01" label={t("erp.hr.pay.receivedInput", { c: payroll.currency })} value={amount} onChange={setAmount} dir="ltr" />
            </div>
            <div className="min-w-0 flex-1">
              <Input label={t("erp.hr.pay.receivedNote")} value={note} onChange={setNote} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => save(amount === "" ? null : Number(amount))} disabled={busy}>
              {t("common.save")}
            </Button>
            {received && (
              <Button variant="ghost" onClick={() => save(null)} disabled={busy}>
                {t("erp.hr.pay.receivedClear")}
              </Button>
            )}
          </div>
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      )}
    </div>
  );
}

export function Payslip({ payroll, closed, received = null, canRecord = false, userId, month, onSaved }) {
  const { t, lang } = useLanguage();
  if (!payroll) return null;
  const c = payroll.currency;
  // Fixed salaries (GM / CEO) have no attendance lines.
  const rows = payroll.fixed
    ? [
        ["base", payroll.base],
        ["manualBonus", payroll.manualBonus],
      ]
    : [
        ["base", payroll.base],
        ["absenceDeduction", -(payroll.absenceDeduction || 0), `${payroll.absentDays || 0} · ${hm(payroll.absentHours || 0)} h`],
        ["hoursDeduction", -payroll.hoursDeduction, `${hm(payroll.missingHours)} h`],
        ["warningDeduction", -payroll.warningDeduction, `${payroll.warnings} · ${payroll.warningPercent}%`],
        ["overtimePay", payroll.overtimePay, `${hm(payroll.overtimeHours)} h`],
        ["manualBonus", payroll.manualBonus],
        ["kpiBonus", payroll.kpiBonus],
      ];
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="font-semibold">{t("erp.hr.payslip")}</p>
        {closed ? (
          <span className="flex items-center gap-1 text-xs text-white/50">
            <Lock size={12} /> {t("erp.hr.closed")}
          </span>
        ) : (
          <span className="text-xs text-white/40">{t("erp.hr.toDate")}</span>
        )}
      </div>
      {!payroll.hasSalary ? (
        <p className="text-sm text-white/50">{t("erp.hr.noSalary")}</p>
      ) : (
        <>
          {payroll.fixed && <p className="mb-3 rounded-xl bg-white/5 px-3 py-2 text-xs text-white/60">{t("erp.hr.fixedSalary")}</p>}
          <div className="space-y-2 text-sm">
            {rows.map(([key, value, hint]) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <span className="text-white/70">
                  {t(`erp.hr.pay.${key}`)}
                  {hint && <span className="ms-2 text-xs text-white/40" dir="ltr">({hint})</span>}
                </span>
                <span className={`tabular-nums ${value < 0 ? "text-red-300" : ""}`}>{money(value || 0, c, lang)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
            <span className="font-semibold">{t("erp.hr.pay.entitled")}</span>
            <span className="text-xl font-bold tabular-nums text-brand-orange">{money(payroll.net, c, lang)}</span>
          </div>
          <p className="mt-2 text-xs text-white/40">
            {t("erp.hr.hourlyRate")}: <span dir="ltr">{money(payroll.hourlyRate, c, lang)}</span>
          </p>
          {(received || canRecord) && <ReceivedPay key={`${userId}-${month}-${received?.amount ?? ""}`} payroll={payroll} received={received} canRecord={canRecord} userId={userId} month={month} onSaved={onSaved} />}
        </>
      )}
    </div>
  );
}

// One person's month. Used by "My attendance" and by HR for any employee.
export default function PersonMonth({ userId, month, onData }) {
  const { t, lang } = useLanguage();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await api(`/api/hr/month?month=${month}${userId ? `&userId=${userId}` : ""}`);
      setData(d);
      onData?.(d);
    } catch (err) {
      setError(errorText(t, err));
    }
  }, [month, userId, t, onData]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (!data)
    return error ? (
      <ErrorText>{error}</ErrorText>
    ) : (
      <div className="space-y-6">
        <SkeletonCards count={6} />
        <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
          <SkeletonTable rows={8} cols={6} />
          <SkeletonText lines={8} />
        </div>
      </div>
    );
  const s = data.attendance.summary;
  const dayName = (d) => new Intl.DateTimeFormat(locale(lang), { weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <StatTile
          label={t("erp.hr.worked")}
          value={hm(s.workedHours)}
          hint={`${t("erp.hr.of")} ${hm(s.requiredToDate)}${s.sickHours ? ` · ${t("erp.hr.includesSick", { h: hm(s.sickHours) })}` : ""}`}
        />
        <StatTile
          label={t("erp.hr.actualHours")}
          value={hm(s.actualHours || 0)}
          tone="text-sky-200"
          hint={s.sickHours ? t("erp.hr.includesSick", { h: hm(s.sickHours) }) : t("erp.hr.actualHint")}
        />
        <StatTile
          label={t("erp.hr.efficiency")}
          value={s.efficiency === null || s.efficiency === undefined ? "—" : `${Math.round(s.efficiency * 100)}%`}
          tone={s.efficiency === null || s.efficiency === undefined ? "" : s.efficiency >= 0.8 ? "text-emerald-300" : s.efficiency >= 0.6 ? "text-amber-200" : "text-red-300"}
          hint={t("erp.hr.efficiencyHint")}
        />
        <StatTile label={t("erp.hr.overtime")} value={hm(s.overtimeHours)} />
        <StatTile label={t("erp.hr.lateCount")} value={s.lateCount} />
        <StatTile label={t("erp.hr.warnings")} value={s.warnings} tone={s.warnings >= 4 ? "text-red-300" : ""} hint={t("erp.hr.warningsHint")} />
        <StatTile label={t("erp.hr.leaveLeft")} value={data.leave.remaining} hint={`${t("erp.hr.of")} ${data.leave.total}`} />
      </div>

      {s.missingCheckOuts > 0 && (
        <p className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200">
          <AlertTriangle size={16} /> {t("erp.hr.missingCheckOuts", { count: s.missingCheckOuts })}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-white/[0.04] text-xs text-white/50">
              <tr>
                {["date", "checkIn", "checkOut", "total", "overtime", "shortage", "activity", "status", "warnings"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-start font-medium">
                    {t(`erp.hr.col.${h}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.attendance.days.map((d) => (
                <tr
                  key={d.date}
                  onClick={() => data.canManage && !data.closed && setEditing(d)}
                  className={`border-t border-white/5 ${DAY_STYLE[d.status] || ""} ${data.canManage && !data.closed ? "cursor-pointer hover:bg-white/[0.05]" : ""}`}
                >
                  <td className="whitespace-nowrap px-3 py-2 text-white/80">
                    <span className="inline-block w-10 text-white/45">{dayName(d.date)}</span>
                    <span dir="ltr">{d.date.slice(5)}</span>
                    {d.ramadan && <span className="ms-1 text-[10px] text-amber-300">☾</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-white/80">{d.checkIn ? formatClock(d.checkIn, lang) : "—"}</td>
                  <td className={`whitespace-nowrap px-3 py-2 tabular-nums ${d.missingCheckOut ? "text-amber-300" : "text-white/80"}`}>
                    {d.checkOut ? formatClock(d.checkOut, lang) : d.missingCheckOut ? "?" : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-white/80" dir="ltr">{d.total ? hm(d.total) : ""}</td>
                  <td className="px-3 py-2 tabular-nums text-emerald-300/80" dir="ltr">{d.overtime ? hm(d.overtime) : ""}</td>
                  <td className="px-3 py-2 tabular-nums text-red-300/80" dir="ltr">{d.shortage ? hm(d.shortage) : ""}</td>
                  <td className="px-3 py-2 tabular-nums text-white/60" dir="ltr">{d.activity !== null ? `${Math.round(d.activity * 100)}%` : ""}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {t(`erp.hr.day.${d.status}`)}
                    {d.overridden && <span className="ms-1 text-[10px] text-white/40">✎</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {d.warnings.map((w) => (
                      <span key={w} className="me-1 inline-block rounded-full bg-red-500/15 px-2 py-0.5 text-red-300">
                        {t(`erp.hr.warning.${w}`)}
                      </span>
                    ))}
                    {d.exempt && <span className="rounded-full bg-white/10 px-2 py-0.5 text-white/60">{t("erp.hr.exempt")}</span>}
                    {d.bonus > 0 && <span className="ms-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300">+{d.bonus}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          {data.salaryLocked ? <SalaryUnlock compact onUnlocked={load} /> : <Payslip payroll={data.payroll} closed={data.closed} received={data.received} canRecord={data.canRecordPay} userId={data.person.id} month={data.month} onSaved={load} />}
          {data.kpi && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-sm text-white/60">{t("erp.nav.kpi")}</p>
              <p className="mt-1 text-3xl font-bold">
                {data.kpi.score}
                <span className="text-base text-white/40"> / 100</span>
              </p>
              <p className="text-sm text-white/60">
                {data.kpi.grade?.[lang]} · {t("erp.kpi.rank")} {data.kpi.rank}/{data.kpi.of}
              </p>
            </div>
          )}
        </div>
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing ? `${editing.date} · ${t(`erp.hr.day.${editing.status}`)}` : ""}>
        {editing && (
          <DayEditor
            day={editing}
            userId={data.person.id}
            onClose={() => setEditing(null)}
            onSaved={(close = true) => {
              if (close) setEditing(null);
              load();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
