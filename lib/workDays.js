// The company's working day, resolved for one date: which days are worked, from when
// to when, and how many hours count. Used by attendance, payroll, leave, capacity and
// the Gantt calendar, so every part of the system reads the same hours.
// Pure functions (no database) so they run in the browser and in tests.
// Day numbers follow JavaScript: 0 = Sunday … 5 = Friday, 6 = Saturday.

export const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const toMinutes = (hhmm, fallback = 0) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
};

export const weekdayOf = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();

// The hours of one weekday. `workHours.days[weekday]` = { start, end, hours }; older
// settings without it use the single workStart / workEnd / dailyHours.
export function weekdayHours(workHours, weekday) {
  const d = workHours?.days?.[weekday];
  const start = d?.start || workHours?.workStart || "09:00";
  const end = d?.end || workHours?.workEnd || "17:00";
  const span = Math.max(0, toMinutes(end) - toMinutes(start)) / 60;
  const hours = Number(d?.hours ?? workHours?.dailyHours) || span || 8;
  return { start, end, hours };
}

// { working, off: "weekend" | "holiday" | null, holiday, special, ramadan, start, end,
//   startMin, endMin, hours } for the date "YYYY-MM-DD".
// A special day (workHours.special) sets that date's hours, even on a weekend or holiday.
// In Ramadan a normal day counts at most `ramadanHours`.
export function daySchedule(iso, calendar = {}, workHours = {}) {
  const weekday = weekdayOf(iso);
  const holiday = (calendar.holidays || []).find((h) => (typeof h === "string" ? h : h.date) === iso) || null;
  const r = calendar.ramadan;
  const ramadan = Boolean(r?.start && r?.end && iso >= r.start && iso <= r.end);
  const special = (workHours.special || []).find((s) => s.date === iso) || null;

  let day;
  if (special) day = { start: special.start, end: special.end, hours: Number(special.hours) || 0 };
  else if (holiday) return { working: false, off: "holiday", holiday, special: null, ramadan, hours: 0, weekday };
  else if ((calendar.weekend || []).includes(weekday)) return { working: false, off: "weekend", holiday: null, special: null, ramadan, hours: 0, weekday };
  else {
    day = weekdayHours(workHours, weekday);
    if (ramadan && workHours.ramadanHours) day.hours = Math.min(day.hours, workHours.ramadanHours);
  }
  const startMin = toMinutes(day.start, 9 * 60);
  let endMin = toMinutes(day.end, startMin + 8 * 60);
  if (endMin <= startMin) endMin = startMin + Math.max(day.hours, 1) * 60;
  return { working: day.hours > 0, off: null, holiday: special ? null : holiday, special, ramadan, weekday, start: day.start, end: day.end, startMin, endMin, hours: day.hours };
}

const pad = (n) => String(n).padStart(2, "0");

// Working hours of one person in a month ("YYYY-MM").
export function monthWorkHours(month, { calendar, workHours }) {
  const [y, m] = month.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let sum = 0;
  for (let d = 1; d <= count; d += 1) sum += daySchedule(`${month}-${pad(d)}`, calendar, workHours).hours;
  return sum;
}
