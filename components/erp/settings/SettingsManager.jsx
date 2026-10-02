"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import BilingualField from "@/components/dashboard/BilingualField";
import SaveBar from "@/components/dashboard/SaveBar";
import { Button, Card, Input, PageHeader, Select } from "@/components/erp/ui/fields";
import { locale } from "@/lib/formatTime";

// Saves one settings group with the shared SaveBar states.
function useSettingSave(key) {
  const { t } = useLanguage();
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  async function save(value, onSaved) {
    setStatus("saving");
    setError("");
    try {
      const res = await api("/api/settings", { method: "PUT", body: { key, value } });
      onSaved?.(res.value);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (err) {
      setStatus("idle");
      setError(errorText(t, err));
    }
  }
  return { status, error, save };
}

const DAYS = [6, 0, 1, 2, 3, 4, 5]; // Saturday first, as in the attendance sheet

function CalendarSettings({ initial }) {
  const { t, lang } = useLanguage();
  const [value, setValue] = useState(initial);
  const { status, error, save } = useSettingSave("calendar");
  const dayName = (d) => new Intl.DateTimeFormat(locale(lang), { weekday: "long" }).format(new Date(2024, 0, 7 + d));

  const setHoliday = (i, patch) =>
    setValue((v) => ({ ...v, holidays: v.holidays.map((h, j) => (j === i ? { ...h, ...patch } : h)) }));

  return (
    <Card className="space-y-6">
      <h2 className="text-lg font-semibold">{t("erp.settings.calendar")}</h2>

      <div>
        <p className="mb-2 text-sm font-medium text-white/70">{t("erp.settings.weekend")}</p>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d) => {
            const on = value.weekend.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() =>
                  setValue((v) => ({ ...v, weekend: on ? v.weekend.filter((x) => x !== d) : [...v.weekend, d] }))
                }
                className={`rounded-full px-4 py-1.5 text-sm ${on ? "bg-brand-orange text-white" : "border border-white/10 bg-white/5 text-white/70"}`}
              >
                {dayName(d)}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-white/70">{t("erp.settings.ramadan")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            type="date"
            label={t("erp.settings.from")}
            value={value.ramadan.start}
            onChange={(start) => setValue((v) => ({ ...v, ramadan: { ...v.ramadan, start } }))}
          />
          <Input
            type="date"
            label={t("erp.settings.to")}
            value={value.ramadan.end}
            onChange={(end) => setValue((v) => ({ ...v, ramadan: { ...v.ramadan, end } }))}
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-white/70">{t("erp.settings.holidays")}</p>
        <div className="space-y-3">
          {value.holidays.map((h, i) => (
            <div key={i} className="grid items-end gap-3 rounded-xl border border-white/10 p-3 sm:grid-cols-[180px_1fr_auto]">
              <Input type="date" label={t("erp.settings.date")} value={h.date} onChange={(date) => setHoliday(i, { date })} />
              <BilingualField label={t("erp.settings.holidayName")} value={h.name} onChange={(name) => setHoliday(i, { name })} />
              <button
                type="button"
                onClick={() => setValue((v) => ({ ...v, holidays: v.holidays.filter((_, j) => j !== i) }))}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10"
                aria-label={t("common.delete")}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <Button
            variant="ghost"
            onClick={() => setValue((v) => ({ ...v, holidays: [...v.holidays, { date: "", name: { ar: "", en: "" } }] }))}
          >
            <Plus size={16} />
            {t("erp.settings.addHoliday")}
          </Button>
        </div>
      </div>

      <SaveBar status={status} error={error} onSave={() => save(value, setValue)} />
    </Card>
  );
}

const WORK_FIELDS = [
  ["workStart", "time"],
  ["workEnd", "time"],
  ["dailyHours", "number"],
  ["ramadanHours", "number"],
  ["minHours", "number"],
  ["graceMinutes", "number"],
  ["overtimeMultiplier", "number"],
  ["monthlyRequiredHours", "number"],
];

function WorkHoursSettings({ initial }) {
  const { t } = useLanguage();
  const [value, setValue] = useState(initial);
  const { status, error, save } = useSettingSave("workHours");

  return (
    <Card className="space-y-6">
      <h2 className="text-lg font-semibold">{t("erp.settings.workHours")}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {WORK_FIELDS.map(([field, type]) => (
          <Input
            key={field}
            type={type}
            step={type === "number" ? "0.5" : undefined}
            dir="ltr"
            label={t(`erp.settings.${field}`)}
            value={value[field]}
            onChange={(v) => setValue((s) => ({ ...s, [field]: type === "number" ? Number(v) : v }))}
          />
        ))}
      </div>
      <SaveBar status={status} error={error} onSave={() => save(value, setValue)} />
    </Card>
  );
}

function CurrencySettings({ initial }) {
  const { t, lang } = useLanguage();
  const [value, setValue] = useState(initial);
  const { status, error, save } = useSettingSave("currencies");
  const setItem = (i, patch) => setValue((v) => ({ ...v, list: v.list.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));

  return (
    <Card className="space-y-6">
      <h2 className="text-lg font-semibold">{t("erp.settings.currencies")}</h2>
      <Select
        label={t("erp.settings.baseCurrency")}
        value={value.base}
        onChange={(base) => setValue((v) => ({ ...v, base }))}
        options={value.list.filter((c) => c.code).map((c) => ({ value: c.code, label: `${c.code} — ${c.name?.[lang] || ""}` }))}
      />
      <p className="text-xs text-white/40">{t("erp.settings.rateHint", { base: value.base })}</p>
      <div className="space-y-3">
        {value.list.map((c, i) => (
          <div key={i} className="grid items-end gap-3 rounded-xl border border-white/10 p-3 sm:grid-cols-[110px_1fr_140px_auto]">
            <Input label={t("erp.settings.code")} value={c.code} dir="ltr" onChange={(code) => setItem(i, { code: code.toUpperCase() })} />
            <BilingualField label={t("erp.org.name")} value={c.name} onChange={(name) => setItem(i, { name })} />
            <Input
              type="number"
              step="0.0001"
              dir="ltr"
              label={t("erp.settings.rate")}
              value={c.rate}
              disabled={c.code === value.base}
              onChange={(rate) => setItem(i, { rate: Number(rate) })}
            />
            <button
              type="button"
              disabled={c.code === value.base}
              onClick={() => setValue((v) => ({ ...v, list: v.list.filter((_, j) => j !== i) }))}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-30"
              aria-label={t("common.delete")}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <Button
          variant="ghost"
          onClick={() => setValue((v) => ({ ...v, list: [...v.list, { code: "", name: { ar: "", en: "" }, rate: 1 }] }))}
        >
          <Plus size={16} />
          {t("erp.settings.addCurrency")}
        </Button>
      </div>
      <SaveBar status={status} error={error} onSave={() => save(value, setValue)} />
    </Card>
  );
}

const KINDS = ["neutral", "excellent", "error", "contribution"];
const SKILLS = ["", "design", "functional", "shop_drawings", "autocad", "max", "render", "project", "management"];

function TasksSettings({ initial }) {
  const { t } = useLanguage();
  const [value, setValue] = useState(initial);
  const { status, error, save } = useSettingSave("tasks");
  const setList = (list, i, patch) =>
    setValue((v) => ({ ...v, [list]: v[list].map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const removeFrom = (list, i) => setValue((v) => ({ ...v, [list]: v[list].filter((_, j) => j !== i) }));

  return (
    <Card className="space-y-6">
      <h2 className="text-lg font-semibold">{t("erp.settings.tasks")}</h2>

      <div>
        <p className="mb-1 text-sm font-medium text-white/70">{t("erp.settings.taskTypes")}</p>
        <p className="mb-3 text-xs text-white/40">{t("erp.settings.keyHint")}</p>
        <div className="space-y-2">
          {value.taskTypes.map((tt, i) => (
            <div key={i} className="grid items-end gap-2 rounded-xl border border-white/10 p-3 sm:grid-cols-[140px_1fr_auto]">
              <Input label={t("erp.settings.code")} value={tt.key} dir="ltr" onChange={(key) => setList("taskTypes", i, { key })} />
              <BilingualField label={t("erp.org.name")} value={tt.name} onChange={(name) => setList("taskTypes", i, { name })} />
              <button type="button" onClick={() => removeFrom("taskTypes", i)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-500/30 text-red-400" aria-label={t("common.delete")}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <Button variant="ghost" onClick={() => setValue((v) => ({ ...v, taskTypes: [...v.taskTypes, { key: "", name: { ar: "", en: "" } }] }))}>
            <Plus size={16} /> {t("erp.settings.addTaskType")}
          </Button>
        </div>
      </div>

      <div>
        <p className="mb-1 text-sm font-medium text-white/70">{t("erp.settings.ratingTags")}</p>
        <p className="mb-3 text-xs text-white/40">{t("erp.settings.ratingHint")}</p>
        <div className="space-y-2">
          {value.ratingTags.map((r, i) => (
            <div key={i} className="grid items-end gap-2 rounded-xl border border-white/10 p-3 lg:grid-cols-[120px_1fr_140px_150px_auto]">
              <Input label={t("erp.settings.code")} value={r.key} dir="ltr" onChange={(key) => setList("ratingTags", i, { key })} />
              <BilingualField label={t("erp.org.name")} value={r.name} onChange={(name) => setList("ratingTags", i, { name })} />
              <Select
                label={t("erp.settings.tagKind")}
                value={r.kind}
                onChange={(kind) => setList("ratingTags", i, { kind })}
                options={KINDS.map((k) => ({ value: k, label: t(`erp.settings.kind_${k}`) }))}
              />
              <Select
                label={t("erp.settings.tagSkill")}
                value={r.skill}
                onChange={(skill) => setList("ratingTags", i, { skill })}
                options={SKILLS.map((k) => ({ value: k, label: k ? t(`erp.settings.skill_${k}`) : "—" }))}
              />
              <button type="button" onClick={() => removeFrom("ratingTags", i)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-500/30 text-red-400" aria-label={t("common.delete")}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <Button
            variant="ghost"
            onClick={() => setValue((v) => ({ ...v, ratingTags: [...v.ratingTags, { key: "", name: { ar: "", en: "" }, kind: "neutral", skill: "" }] }))}
          >
            <Plus size={16} /> {t("erp.settings.addRatingTag")}
          </Button>
        </div>
      </div>
      <SaveBar status={status} error={error} onSave={() => save(value, setValue)} />
    </Card>
  );
}

export default function SettingsManager({ initial }) {
  const { t } = useLanguage();
  return (
    <div className="max-w-5xl">
      <PageHeader title={t("erp.nav.settings")} subtitle={t("erp.settings.subtitle")} />
      <div className="space-y-6">
        <CalendarSettings initial={initial.calendar} />
        <WorkHoursSettings initial={initial.workHours} />
        <CurrencySettings initial={initial.currencies} />
        <TasksSettings initial={initial.tasks} />
      </div>
    </div>
  );
}
