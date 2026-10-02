"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { api, errorText } from "@/lib/clientApi";
import { Button, Card, ErrorText, Input, Select, Toggle } from "@/components/erp/ui/fields";
import { money } from "@/components/erp/hr/hrUi";
import HrFile from "@/components/erp/hr/HrFile";
import SalaryUnlock from "@/components/erp/hr/SalaryUnlock";
import { SkeletonText } from "@/components/erp/ui/Loading";

// Contract, leave allowance, badge ID, KPI exclusion and salary history of one employee.
export default function HrProfile({ userId, currencies, onChanged }) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [salary, setSalary] = useState({ amount: "", currency: currencies?.base || "USD", from: "", note: "" });
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const canManage = user?.permissions?.includes("attendance.manage");
  const canPayManage = user?.permissions?.includes("payroll.manage");

  const load = useCallback(async () => {
    const d = await api(`/api/hr/employees/${userId}`).catch(() => null);
    if (d) {
      setData(d);
      setForm(d.profile);
    }
  }, [userId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (!form)
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SkeletonText lines={6} />
        </Card>
        <Card>
          <SkeletonText lines={6} />
        </Card>
      </div>
    );
  const set = (f) => (v) => setForm((x) => ({ ...x, [f]: v }));

  async function saveProfile() {
    setError("");
    setMsg("");
    try {
      await api(`/api/hr/employees/${userId}`, { method: "PATCH", body: form });
      setMsg(t("common.saved"));
      onChanged?.();
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  async function addSalary() {
    setError("");
    try {
      await api("/api/hr/salaries", { method: "POST", body: { ...salary, userId } });
      setSalary((s) => ({ ...s, amount: "", from: "", note: "" }));
      load();
      onChanged?.();
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  async function removeSalary(id) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    await api(`/api/hr/salaries/${id}`, { method: "DELETE" }).catch(() => {});
    load();
    onChanged?.();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-4">
        <p className="font-semibold">{t("erp.hr.profile")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={t("erp.staff.badgeId")} value={form.badgeId} onChange={set("badgeId")} dir="ltr" disabled={!canManage} />
          <Input type="number" label={t("erp.hr.annualLeaveDays")} value={form.annualLeaveDays} onChange={set("annualLeaveDays")} dir="ltr" disabled={!canManage} />
          <Input type="date" label={t("erp.hr.contractStart")} value={form.contractStart} onChange={set("contractStart")} disabled={!canManage} />
          <Input type="date" label={t("erp.hr.contractEnd")} value={form.contractEnd} onChange={set("contractEnd")} disabled={!canManage} />
        </div>
        <Toggle checked={form.kpiExcluded} onChange={(v) => canManage && set("kpiExcluded")(v)} label={t("erp.hr.kpiExcluded")} />
        {canManage && <Button onClick={saveProfile}>{t("common.save")}</Button>}
        {msg && <p className="text-sm text-emerald-300">{msg}</p>}
      </Card>

      {data.salaryLocked && <SalaryUnlock compact onUnlocked={load} />}

      {data.canPay && (
        <Card className="space-y-4">
          <p className="font-semibold">{t("erp.hr.salaryHistory")}</p>
          <div className="space-y-1.5">
            {data.salaries.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2 text-sm">
                <span className="tabular-nums">{money(s.amount, s.currency, lang)}</span>
                <span className="text-white/50" dir="ltr">
                  {t("erp.settings.from")} {s.from}
                </span>
                {s.note && <span className="min-w-0 flex-1 truncate text-white/40">{s.note}</span>}
                {canPayManage && (
                  <button type="button" onClick={() => removeSalary(s.id)} className="ms-auto text-red-400" aria-label={t("common.delete")}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
            {data.salaries.length === 0 && <p className="text-sm text-white/40">{t("erp.hr.noSalary")}</p>}
          </div>
          {canPayManage && (
            <div className="grid items-end gap-2 sm:grid-cols-[1fr_100px_1fr]">
              <Input type="number" label={t("erp.hr.amount")} value={salary.amount} onChange={(amount) => setSalary((s) => ({ ...s, amount }))} dir="ltr" />
              <Select
                label={t("erp.org.currency")}
                value={salary.currency}
                onChange={(currency) => setSalary((s) => ({ ...s, currency }))}
                options={(currencies?.list || []).map((c) => ({ value: c.code, label: c.code }))}
              />
              <Input type="date" label={t("erp.hr.effectiveFrom")} value={salary.from} onChange={(from) => setSalary((s) => ({ ...s, from }))} />
              <div className="sm:col-span-3">
                <Button onClick={addSalary} disabled={!salary.amount || !salary.from}>
                  {t("erp.hr.addSalary")}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
      {data.canEditFile && <HrFile key={data.profile.id} userId={userId} data={data} onChanged={load} />}

      <div className="lg:col-span-2">
        <ErrorText>{error}</ErrorText>
      </div>
    </div>
  );
}
