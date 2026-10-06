"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Mail, Pencil, Phone, Plus, Trash2, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDate, formatDateTime } from "@/lib/formatTime";
import { Button, Card, ErrorText, Input, Select, Toggle } from "@/components/erp/ui/fields";
import { SkeletonText } from "@/components/erp/ui/Loading";
import { hm, money, MonthPicker } from "@/components/erp/hr/hrUi";
import PersonMonth from "@/components/erp/hr/PersonMonth";
import SalaryUnlock from "@/components/erp/hr/SalaryUnlock";
import { DocumentsCard, EmergencyContactCard } from "@/components/erp/hr/HrFile";
import StaffEditor from "@/components/erp/staff/StaffEditor";
import KpiRing from "@/components/erp/staff/KpiRing";

const TABS = ["overview", "attendance", "contract", "salary", "documents"];

function Field({ label, children }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-white/45">{label}</p>
      <div className="mt-0.5 truncate text-sm text-white/90">{children || "—"}</div>
    </div>
  );
}

function Saved({ show }) {
  const { t } = useLanguage();
  return show ? <span className="text-sm text-emerald-300">{t("common.saved")}</span> : null;
}

// Saves part of the HR profile and briefly shows "Saved".
function usePatch(userId, onDone) {
  const { t } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const patch = async (body) => {
    setSaving(true);
    setError("");
    try {
      await api(`/api/hr/employees/${userId}`, { method: "PATCH", body });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onDone?.();
      return true;
    } catch (err) {
      setError(errorText(t, err));
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { patch, saving, saved, error };
}

function EmploymentCard({ person, profile, roles, org, canManage, meId, onStaffSaved }) {
  const { t, lang } = useLanguage();
  const [editing, setEditing] = useState(false);
  const nameOf = (list, id) => list.find((i) => i.id === id)?.name?.[lang] || "";
  const roleName = roles.find((r) => r.key === person.role)?.name?.[lang] || person.role;

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">{t("erp.staffFile.employment")}</p>
        {canManage && !editing && (
          <Button variant="ghost" onClick={() => setEditing(true)}>
            <Pencil size={14} /> {t("common.edit")}
          </Button>
        )}
      </div>
      {editing ? (
        <StaffEditor
          person={person}
          roles={roles}
          org={org}
          meId={meId}
          header={false}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false);
            onStaffSaved(saved);
          }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("erp.org.department")}>{nameOf(org.departments, person.department)}</Field>
          <Field label={t("erp.org.jobTitle")}>{nameOf(org.jobTitles, person.jobTitle)}</Field>
          <Field label={t("erp.org.branch")}>{nameOf(org.branches, person.branch)}</Field>
          <Field label={t("erp.staff.role")}>{person.role === "user" ? t("erp.staff.pending") : roleName}</Field>
          <Field label={t("erp.staff.status")}>
            <span className={person.status === "inactive" ? "text-red-300" : "text-emerald-300"}>
              {t(`erp.staff.${person.status === "inactive" ? "inactive" : "active"}`)}
            </span>
          </Field>
          <Field label={t("erp.staffFile.joined")}>{formatDate(person.createdAt, lang)}</Field>
          <Field label={t("erp.hr.contractStart")}>{profile.contractStart && <span dir="ltr">{profile.contractStart}</span>}</Field>
          <Field label={t("erp.hr.contractEnd")}>{profile.contractEnd && <span dir="ltr">{profile.contractEnd}</span>}</Field>
          <Field label={t("erp.staff.badgeId")}>{profile.badgeId && <span dir="ltr">{profile.badgeId}</span>}</Field>
          <Field label={t("erp.staffFile.lastLogin")}>{person.lastLoginAt && formatDateTime(person.lastLoginAt, lang)}</Field>
        </div>
      )}
    </Card>
  );
}

function ContactCard({ person, profile, userId, onChanged, onPhone }) {
  const { t } = useLanguage();
  const [phone, setPhone] = useState(profile.phone);
  const { patch, saving, saved, error } = usePatch(userId, onChanged);
  return (
    <Card className="space-y-4">
      <p className="font-semibold">{t("erp.staffFile.contact")}</p>
      <div className="space-y-3 text-sm">
        <a href={`mailto:${person.email}`} className="flex items-center gap-2 text-white/85 hover:text-brand-orange" dir="ltr">
          <Mail size={15} className="text-white/45" /> {person.email}
        </a>
        {profile.phone && (
          <a href={`tel:${profile.phone}`} className="flex items-center gap-2 text-white/85 hover:text-brand-orange" dir="ltr">
            <Phone size={15} className="text-white/45" /> {profile.phone}
          </a>
        )}
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input label={t("erp.staff.phone")} value={phone} onChange={setPhone} dir="ltr" />
        </div>
        <Button variant="ghost" onClick={async () => (await patch({ phone })) && onPhone(phone)} loading={saving} disabled={phone === profile.phone}>
          {t("common.save")}
        </Button>
      </div>
      <Saved show={saved} />
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

function SkillsCard({ userId, skills: initial, onChanged }) {
  const { t } = useLanguage();
  const [skills, setSkills] = useState(initial);
  const [draft, setDraft] = useState("");
  const { patch, saving, error } = usePatch(userId, onChanged);

  async function update(next) {
    const before = skills;
    setSkills(next);
    if (!(await patch({ skills: next }))) setSkills(before);
  }
  function add() {
    const value = draft.trim();
    if (!value || skills.some((s) => s.toLowerCase() === value.toLowerCase())) return setDraft("");
    setDraft("");
    update([...skills, value]);
  }

  return (
    <Card className="space-y-4">
      <p className="font-semibold">{t("erp.staffFile.skills")}</p>
      <div className="flex flex-wrap gap-2">
        {skills.map((s) => (
          <span key={s} className="flex items-center gap-1.5 rounded-full bg-brand-orange/15 px-3 py-1 text-sm text-brand-orange">
            {s}
            <button type="button" onClick={() => update(skills.filter((x) => x !== s))} aria-label={t("common.delete")} className="hover:text-white">
              <X size={13} />
            </button>
          </span>
        ))}
        {skills.length === 0 && <p className="text-sm text-white/40">{t("erp.staffFile.noSkills")}</p>}
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            label={t("erp.staffFile.addSkill")}
            value={draft}
            onChange={setDraft}
            placeholder="AutoCAD, 3ds Max, Revit…"
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          />
        </div>
        <Button variant="ghost" onClick={add} disabled={!draft.trim() || saving}>
          <Plus size={15} /> {t("common.add")}
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

function KpiCard({ hrRow }) {
  const { t, lang } = useLanguage();
  const kpi = hrRow?.kpi;
  const s = hrRow?.summary;
  const stats = s
    ? [
        [t("erp.hr.worked"), `${hm(s.workedHours)} / ${hm(s.requiredToDate)}`],
        [t("erp.hr.efficiency"), s.efficiency === null ? "—" : `${Math.round(s.efficiency * 100)}%`],
        [t("erp.hr.warnings"), s.warnings],
        [t("erp.hr.absent"), s.absentDays],
        [t("erp.hr.lateCount"), s.lateCount],
        [t("erp.hr.overtime"), hm(s.overtimeHours)],
      ]
    : [];
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">{t("erp.staffFile.kpiSummary")}</p>
        <Link href="/dashboard/kpi" className="text-xs text-white/50 hover:text-brand-orange">
          {t("erp.staffFile.openKpi")}
        </Link>
      </div>
      <div className="flex items-center gap-5">
        <KpiRing score={kpi?.score ?? null} size={96} stroke={8} />
        <div className="space-y-1 text-sm">
          {kpi ? (
            <>
              <p className="text-lg font-semibold">{kpi.grade?.[lang] || "—"}</p>
              {kpi.rank && (
                <p className="text-white/60">
                  {t("erp.kpi.rank")} {kpi.rank}
                </p>
              )}
            </>
          ) : (
            <p className="text-white/45">{t("erp.staffFile.noKpi")}</p>
          )}
        </div>
      </div>
      {stats.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-white/10 pt-4 sm:grid-cols-3">
          {stats.map(([label, value]) => (
            <Field key={label} label={label}>
              <span className="tabular-nums" dir="ltr">
                {value}
              </span>
            </Field>
          ))}
        </div>
      )}
    </Card>
  );
}

function ContractCard({ userId, profile, onChanged }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({
    badgeId: profile.badgeId,
    annualLeaveDays: profile.annualLeaveDays,
    contractStart: profile.contractStart,
    contractEnd: profile.contractEnd,
    kpiExcluded: profile.kpiExcluded,
  });
  const set = (f) => (v) => setForm((x) => ({ ...x, [f]: v }));
  const { patch, saving, saved, error } = usePatch(userId, onChanged);
  return (
    <Card className="space-y-4">
      <p className="font-semibold">{t("erp.hr.profile")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={t("erp.staff.badgeId")} value={form.badgeId} onChange={set("badgeId")} dir="ltr" />
        <Input type="number" label={t("erp.hr.annualLeaveDays")} value={form.annualLeaveDays} onChange={set("annualLeaveDays")} dir="ltr" />
        <Input type="date" label={t("erp.hr.contractStart")} value={form.contractStart} onChange={set("contractStart")} />
        <Input type="date" label={t("erp.hr.contractEnd")} value={form.contractEnd} onChange={set("contractEnd")} />
      </div>
      <Toggle checked={form.kpiExcluded} onChange={set("kpiExcluded")} label={t("erp.hr.kpiExcluded")} />
      <div className="flex items-center gap-3">
        <Button onClick={() => patch(form)} loading={saving}>
          {t("common.save")}
        </Button>
        <Saved show={saved} />
      </div>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

const HOUR_FIELDS = [
  ["workStart", "time"],
  ["workEnd", "time"],
  ["dailyHours", "number"],
  ["ramadanHours", "number"],
  ["minHours", "number"],
  ["graceMinutes", "number"],
];

function WorkHoursCard({ userId, schedule, company, onChanged }) {
  const { t } = useLanguage();
  const [form, setForm] = useState(() => Object.fromEntries(Object.entries(schedule).map(([k, v]) => [k, v ?? ""])));
  const { patch, saving, saved, error } = usePatch(userId, onChanged);
  return (
    <Card className="space-y-4">
      <p className="font-semibold">{t("erp.staffFile.workHours")}</p>
      <Toggle checked={form.custom} onChange={(custom) => setForm((f) => ({ ...f, custom }))} label={t("erp.staffFile.customHours")} />
      <p className="text-xs text-white/45">
        {t("erp.staffFile.companyHours", { start: company.workStart, end: company.workEnd, hours: company.dailyHours })}
      </p>
      {form.custom && (
        <div className="grid gap-4 sm:grid-cols-2">
          {HOUR_FIELDS.map(([f, type]) => (
            <Input
              key={f}
              type={type}
              label={t(`erp.settings.${f}`)}
              value={form[f]}
              placeholder={String(company[f] ?? "")}
              onChange={(v) => setForm((x) => ({ ...x, [f]: v }))}
              dir="ltr"
            />
          ))}
          <p className="text-xs text-white/40 sm:col-span-2">{t("erp.staffFile.blankUsesCompany")}</p>
        </div>
      )}
      <div className="flex items-center gap-3">
        <Button onClick={() => patch({ workSchedule: form })} loading={saving}>
          {t("common.save")}
        </Button>
        <Saved show={saved} />
      </div>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

function SalaryCard({ userId, data, currencies, onChanged }) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const canPayManage = user?.permissions?.includes("payroll.manage");
  const [salary, setSalary] = useState({ amount: "", currency: currencies?.base || "USD", from: "", note: "" });
  const [error, setError] = useState("");

  if (data.salaryLocked) return <SalaryUnlock onUnlocked={onChanged} />;
  if (!data.canPay) return <p className="text-sm text-white/45">{t("erp.noAccess")}</p>;

  async function addSalary() {
    setError("");
    try {
      await api("/api/hr/salaries", { method: "POST", body: { ...salary, userId } });
      setSalary((s) => ({ ...s, amount: "", from: "", note: "" }));
      onChanged();
    } catch (err) {
      setError(errorText(t, err));
    }
  }
  async function removeSalary(id) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    await api(`/api/hr/salaries/${id}`, { method: "DELETE" }).catch((err) => setError(errorText(t, err)));
    onChanged();
  }

  const current = data.salaries.find((s) => s.from <= new Date().toISOString().slice(0, 10));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-4">
        <p className="font-semibold">{t("erp.hr.salaryHistory")}</p>
        {current && (
          <div>
            <p className="text-xs text-white/45">{t("erp.staffFile.currentSalary")}</p>
            <p className="text-2xl font-bold tabular-nums text-brand-orange">{money(current.amount, current.currency, lang)}</p>
          </div>
        )}
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
      </Card>
      {canPayManage && (
        <Card className="space-y-4">
          <p className="font-semibold">{t("erp.hr.addSalary")}</p>
          <div className="grid gap-4 sm:grid-cols-[1fr_110px]">
            <Input type="number" label={t("erp.hr.amount")} value={salary.amount} onChange={(amount) => setSalary((s) => ({ ...s, amount }))} dir="ltr" />
            <Select
              label={t("erp.org.currency")}
              value={salary.currency}
              onChange={(currency) => setSalary((s) => ({ ...s, currency }))}
              options={(currencies?.list || []).map((c) => ({ value: c.code, label: c.code }))}
            />
          </div>
          <Input type="date" label={t("erp.hr.effectiveFrom")} value={salary.from} onChange={(from) => setSalary((s) => ({ ...s, from }))} />
          <Input label={t("erp.hr.note")} value={salary.note} onChange={(note) => setSalary((s) => ({ ...s, note }))} />
          <Button onClick={addSalary} disabled={!salary.amount || !salary.from}>
            {t("erp.hr.addSalary")}
          </Button>
          <ErrorText>{error}</ErrorText>
        </Card>
      )}
    </div>
  );
}

/**
 * The full HR file of one employee, shown when their row on the staff page is
 * expanded (HR and the general manager). Everything HR controls per person lives
 * here: employment, contact, skills, KPI, attendance & payslip, contract, working
 * hours, salary and documents.
 */
export default function EmployeeFile({ person, hrRow, roles, org, canManage, meId, currencies, month: currentMonth, onStaffSaved, onHrChanged }) {
  const { t } = useLanguage();
  const [tab, setTab] = useState("overview");
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const pending = person.role === "user";

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/hr/employees/${person.id}`));
    } catch (err) {
      setError(errorText(t, err));
    }
  }, [person.id, t]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const changed = () => {
    load();
    onHrChanged?.();
  };

  if (!data)
    return error ? (
      <ErrorText>{error}</ErrorText>
    ) : (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SkeletonText lines={6} />
        </Card>
        <Card>
          <SkeletonText lines={6} />
        </Card>
      </div>
    );

  const tabs = TABS.filter((k) => !(pending && k === "attendance"));
  const layoutId = `file-tab-${person.id}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10">
        <div className="relative flex flex-wrap gap-1">
          {tabs.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className="relative px-3 py-2.5 text-sm font-medium text-white/60 data-[active=true]:text-white"
              data-active={tab === key}
            >
              {t(`erp.staffFile.tab.${key}`)}
              {tab === key && <motion.span layoutId={layoutId} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-orange" />}
            </button>
          ))}
        </div>
        {tab === "attendance" && <MonthPicker month={month} onChange={setMonth} />}
      </div>

      {pending && <p className="rounded-xl bg-brand-orange/10 px-4 py-2.5 text-sm text-brand-orange">{t("erp.staffFile.pendingNote")}</p>}

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <EmploymentCard person={person} profile={data.profile} roles={roles} org={org} canManage={canManage} meId={meId} onStaffSaved={onStaffSaved} />
          <KpiCard hrRow={hrRow} />
          <ContactCard key={`c${data.profile.phone}`} person={person} profile={data.profile} userId={person.id} onChanged={changed} onPhone={(phone) => onStaffSaved({ ...person, phone })} />
          <SkillsCard userId={person.id} skills={data.profile.skills} onChanged={load} />
          {data.canEditFile && (
            <div className="lg:col-span-2">
              <EmergencyContactCard userId={person.id} data={data} />
            </div>
          )}
        </div>
      )}

      {tab === "attendance" && <PersonMonth key={month} userId={person.id} month={month} />}

      {tab === "contract" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ContractCard userId={person.id} profile={data.profile} onChanged={changed} />
          <WorkHoursCard userId={person.id} schedule={data.profile.workSchedule} company={data.companyWorkHours} onChanged={changed} />
        </div>
      )}

      {tab === "salary" && <SalaryCard userId={person.id} data={data} currencies={currencies} onChanged={changed} />}

      {tab === "documents" && (data.canEditFile ? <DocumentsCard userId={person.id} data={data} onChanged={load} /> : <p className="text-sm text-white/45">{t("erp.noAccess")}</p>)}
    </div>
  );
}
