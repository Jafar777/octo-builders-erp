"use client";

import { useState } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import BilingualField from "@/components/dashboard/BilingualField";
import SaveBar from "@/components/dashboard/SaveBar";
import { Button, Card, Input, PageHeader, Select } from "@/components/erp/ui/fields";
import { locale } from "@/lib/formatTime";
import { daySchedule, monthWorkHours } from "@/lib/workDays";

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

const dayLabel = (lang, d) => new Intl.DateTimeFormat(locale(lang), { weekday: "long" }).format(new Date(2024, 0, 7 + d));

// The calendar's state lives in SettingsManager: the working-hours card needs it too.
function CalendarSettings({ value, setValue }) {
  const { t, lang } = useLanguage();
  const { status, error, save } = useSettingSave("calendar");
  const dayName = (d) => dayLabel(lang, d);

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

// Required monthly hours aren't typed: they're the sum of each day's hours (see MonthTotal).
const WORK_FIELDS = ["ramadanHours", "minHours", "graceMinutes", "overtimeMultiplier"];

// The current month's required hours from the (unsaved) day table and calendar — read only,
// so the month can never ask for more hours than its working days hold.
function MonthTotal({ calendar, workHours }) {
  const { t, lang } = useLanguage();
  const now = new Date();
  const [y, m] = [now.getFullYear(), now.getMonth() + 1];
  const month = `${y}-${String(m).padStart(2, "0")}`;
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days = Array.from({ length: count }, (_, i) => daySchedule(`${month}-${String(i + 1).padStart(2, "0")}`, calendar, workHours));
  const working = days.filter((d) => d.working).length;
  const hours = Math.round(monthWorkHours(month, { calendar, workHours }) * 100) / 100;
  const name = new Intl.DateTimeFormat(locale(lang), { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-sm font-medium text-white/70">{t("erp.settings.monthlyRequiredHours")}</p>
      <p className="mt-1 text-2xl font-semibold" dir="ltr">
        {t("erp.settings.monthTotal", { h: hours })}
      </p>
      <p className="mt-1 text-xs text-white/50">{t("erp.settings.monthTotalHint", { month: name, days: count, working, off: count - working })}</p>
    </div>
  );
}

const spanHours = (start, end) => {
  const m = (x) => (/^\d{2}:\d{2}$/.test(x || "") ? Number(x.slice(0, 2)) * 60 + Number(x.slice(3)) : null);
  const a = m(start);
  const b = m(end);
  return a == null || b == null || b <= a ? 0 : Math.round(((b - a) / 60) * 100) / 100;
};

// Changing a start / end time also moves the counted hours when they matched the old span.
function retime(day, patch) {
  const next = { ...day, ...patch };
  if (Number(day.hours) === spanHours(day.start, day.end)) next.hours = spanHours(next.start, next.end);
  return next;
}

// Start, end and the hours that count for one day (a weekday or a special date).
function DayTimes({ day, onChange, disabled, t }) {
  return (
    <>
      <Input type="time" dir="ltr" label={t("erp.settings.workStart")} value={day.start} disabled={disabled} onChange={(start) => onChange(retime(day, { start }))} />
      <Input type="time" dir="ltr" label={t("erp.settings.workEnd")} value={day.end} disabled={disabled} onChange={(end) => onChange(retime(day, { end }))} />
      <Input
        type="number"
        step="0.5"
        min="0.5"
        dir="ltr"
        label={t("erp.settings.dayHours")}
        value={day.hours}
        disabled={disabled}
        onChange={(hours) => onChange({ ...day, hours: hours === "" ? "" : Number(hours) })}
      />
    </>
  );
}

// Hours of each weekday, special dates with their own hours, and the attendance rules.
function WorkHoursSettings({ initial, calendar }) {
  const weekend = calendar.weekend;
  const { t, lang } = useLanguage();
  const [value, setValue] = useState(initial);
  const { status, error, save } = useSettingSave("workHours");
  const setDay = (wd, day) => setValue((v) => ({ ...v, days: v.days.map((d, i) => (i === wd ? day : d)) }));
  const setSpecial = (i, patch) => setValue((v) => ({ ...v, special: v.special.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const working = DAYS.filter((d) => !weekend.includes(d));
  const weekTotal = working.reduce((n, d) => n + (Number(value.days[d]?.hours) || 0), 0);

  return (
    <Card className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("erp.settings.workHours")}</h2>
        <p className="mt-1 text-xs text-white/60">{t("erp.settings.workHoursHint")}</p>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-white/70">{t("erp.settings.weekHours")}</p>
          <div className="flex items-center gap-3 text-xs text-white/50">
            <span>{t("erp.settings.weekTotal", { h: Math.round(weekTotal * 100) / 100 })}</span>
            {working.length > 1 && (
              <Button
                variant="ghost"
                onClick={() => setValue((v) => ({ ...v, days: v.days.map((d, i) => (weekend.includes(i) ? d : { ...v.days[working[0]] })) }))}
              >
                {t("erp.settings.sameAllDays", { day: dayLabel(lang, working[0]) })}
              </Button>
            )}
          </div>
        </div>
        <div className="space-y-2">
          {DAYS.map((wd) => {
            const off = weekend.includes(wd);
            return (
              <div key={wd} className={`grid items-end gap-3 rounded-xl border border-white/10 p-3 sm:grid-cols-[140px_1fr_1fr_1fr] ${off ? "opacity-50" : ""}`}>
                <div className="text-sm font-medium sm:pb-2.5">
                  {dayLabel(lang, wd)}
                  {off && <span className="block text-[11px] font-normal text-white/50">{t("erp.settings.dayOff")}</span>}
                </div>
                <DayTimes day={value.days[wd]} disabled={off} onChange={(day) => setDay(wd, day)} t={t} />
              </div>
            );
          })}
        </div>
      </div>

      <MonthTotal calendar={calendar} workHours={value} />

      <div>
        <p className="mb-1 text-sm font-medium text-white/70">{t("erp.settings.specialDays")}</p>
        <p className="mb-3 text-xs text-white/60">{t("erp.settings.specialDaysHint")}</p>
        <div className="space-y-3">
          {value.special.map((sd, i) => (
            <div key={i} className="space-y-3 rounded-xl border border-white/10 p-3">
              <div className="grid items-end gap-3 sm:grid-cols-[170px_1fr_1fr_1fr_auto]">
                <Input type="date" label={t("erp.settings.date")} value={sd.date} onChange={(date) => setSpecial(i, { date })} />
                <DayTimes day={sd} onChange={(day) => setSpecial(i, day)} t={t} />
                <button
                  type="button"
                  onClick={() => setValue((v) => ({ ...v, special: v.special.filter((_, j) => j !== i) }))}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10"
                  aria-label={t("common.delete")}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <BilingualField label={t("erp.settings.specialName")} value={sd.name} onChange={(name) => setSpecial(i, { name })} />
            </div>
          ))}
          <Button
            variant="ghost"
            onClick={() =>
              setValue((v) => ({ ...v, special: [...v.special, { date: "", start: v.workStart, end: v.workEnd, hours: v.dailyHours, name: { ar: "", en: "" } }] }))
            }
          >
            <Plus size={16} />
            {t("erp.settings.addSpecialDay")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {WORK_FIELDS.map((field) => (
          <Input
            key={field}
            type="number"
            step="0.5"
            dir="ltr"
            label={t(`erp.settings.${field}`)}
            value={value[field]}
            onChange={(v) => setValue((s) => ({ ...s, [field]: Number(v) }))}
          />
        ))}
      </div>
      <p className="text-xs text-white/60">{t("erp.settings.rulesHint")}</p>
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
      <p className="text-xs text-white/60">{t("erp.settings.rateHint", { base: value.base })}</p>
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

// A list whose rows are dragged up and down by their handle (the inputs stay usable:
// a row is only draggable while its handle is held). `onReorder(from, to)`.
function ReorderList({ items, onReorder, className, renderRow, t }) {
  const [armed, setArmed] = useState(null); // row whose handle is pressed
  const [from, setFrom] = useState(null);
  const [over, setOver] = useState(null);
  const end = () => {
    setArmed(null);
    setFrom(null);
    setOver(null);
  };
  return items.map((item, i) => (
    <div
      key={i}
      draggable={armed === i}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(i));
        setFrom(i);
      }}
      onDragOver={(e) => {
        if (from === null) return;
        e.preventDefault();
        if (over !== i) setOver(i);
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (from !== null && over !== null && from !== over) onReorder(from, over);
        end();
      }}
      onDragEnd={end}
      className={`relative flex items-stretch gap-2 rounded-xl border p-3 ${from === i ? "border-white/10 opacity-40" : over === i && from !== null ? "border-brand-orange" : "border-white/10"}`}
    >
      <span
        onPointerDown={() => setArmed(i)}
        onPointerUp={() => setArmed(null)}
        className="flex shrink-0 cursor-grab items-center text-white/50 hover:text-white/70 active:cursor-grabbing"
        title={t("erp.settings.dragToOrder")}
      >
        <GripVertical size={16} />
      </span>
      <div className={`min-w-0 flex-1 ${className}`}>{renderRow(item, i)}</div>
    </div>
  ));
}

function TasksSettings({ initial }) {
  const { t } = useLanguage();
  const [value, setValue] = useState(initial);
  const { status, error, save } = useSettingSave("tasks");
  const setList = (list, i, patch) =>
    setValue((v) => ({ ...v, [list]: v[list].map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const removeFrom = (list, i) => setValue((v) => ({ ...v, [list]: v[list].filter((_, j) => j !== i) }));
  // Dragged up or down: the order is kept as it's saved (task type lists, review tags).
  const move = (list) => (from, to) =>
    setValue((v) => {
      const next = [...v[list]];
      const [row] = next.splice(from, 1);
      next.splice(to, 0, row);
      return { ...v, [list]: next };
    });

  return (
    <Card className="space-y-6">
      <h2 className="text-lg font-semibold">{t("erp.settings.tasks")}</h2>

      <div>
        <p className="mb-1 text-sm font-medium text-white/70">{t("erp.settings.taskTypes")}</p>
        <p className="mb-3 text-xs text-white/60">{t("erp.settings.keyHint")}</p>
        <div className="space-y-2">
          <ReorderList
            items={value.taskTypes}
            onReorder={move("taskTypes")}
            t={t}
            className="grid items-end gap-2 sm:grid-cols-[140px_1fr_auto]"
            renderRow={(tt, i) => (
              <>
                <Input label={t("erp.settings.code")} value={tt.key} dir="ltr" onChange={(key) => setList("taskTypes", i, { key })} />
                <BilingualField label={t("erp.org.name")} value={tt.name} onChange={(name) => setList("taskTypes", i, { name })} />
                <button type="button" onClick={() => removeFrom("taskTypes", i)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-500/30 text-red-400" aria-label={t("common.delete")}>
                  <Trash2 size={15} />
                </button>
              </>
            )}
          />
          <Button variant="ghost" onClick={() => setValue((v) => ({ ...v, taskTypes: [...v.taskTypes, { key: "", name: { ar: "", en: "" } }] }))}>
            <Plus size={16} /> {t("erp.settings.addTaskType")}
          </Button>
        </div>
      </div>

      <div>
        <p className="mb-1 text-sm font-medium text-white/70">{t("erp.settings.ratingTags")}</p>
        <p className="mb-3 text-xs text-white/60">{t("erp.settings.ratingHint")}</p>
        <div className="space-y-2">
          <ReorderList
            items={value.ratingTags}
            onReorder={move("ratingTags")}
            t={t}
            className="grid items-end gap-2 lg:grid-cols-[120px_1fr_140px_150px_auto]"
            renderRow={(r, i) => (
              <>
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
              </>
            )}
          />
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
  const [calendar, setCalendar] = useState(initial.calendar);
  return (
    <div className="max-w-5xl">
      <PageHeader title={t("erp.nav.settings")} subtitle={t("erp.settings.subtitle")} />
      <div className="space-y-6">
        <CalendarSettings value={calendar} setValue={setCalendar} />
        <WorkHoursSettings initial={initial.workHours} calendar={calendar} />
        <CurrencySettings initial={initial.currencies} />
        <TasksSettings initial={initial.tasks} />
      </div>
    </div>
  );
}
