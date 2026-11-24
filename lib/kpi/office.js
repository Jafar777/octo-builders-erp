// The office KPI: how the secretary (roles with kpiProfile "office") is scored. She has no
// Gantt work, so instead of tasks it measures what an executive office is for — answering
// fast, closing what she opens, getting answers from departments, documenting, logging her
// day — plus the CEO's monthly rating. Attendance counts as for everyone (lib/kpi/config.js).
// Pure: lib/hr.js loads the month's records and lib/kpi/engine.js scores them.

const b = (min, max, points) => ({ min, max, points });
const n = (ar, en) => ({ ar, en });
const HOUR = 3600000;

export const OFFICE_METRICS = {
  response_24h_pct: { unit: "%" }, // new inquiries / calls to return handled within 24 h
  followup_on_time_pct: { unit: "%" }, // her items due this month closed by their date
  overdue_open: { unit: "×" }, // her items still open past their date at month end
  department_answer_pct: { unit: "%" }, // requests she sent that got an answer by their date
  minutes_24h_pct: { unit: "%" }, // meetings held with minutes written within 24 h
  correspondence_linked_pct: { unit: "%" }, // correspondence logged with the file or its link
  intake_complete_pct: { unit: "%" }, // intake forms she filled with every key field
  activity_days_pct: { unit: "%" }, // days she logged work ÷ days she was present
  ceo_rating_pct: { unit: "%" }, // the CEO's monthly rating
};

export const DEFAULT_OFFICE_KPI = {
  indicators: [
    {
      key: "responsiveness",
      name: n("سرعة الاستجابة", "Responsiveness"),
      items: [{ key: "response", metric: "response_24h_pct", name: n("الرد على الاستفسارات والمكالمات خلال 24 ساعة", "Inquiries & calls handled within 24 h"), bands: [b(90, null, 12), b(75, 90, 9), b(60, 75, 5), b(null, 60, 1)] }],
    },
    {
      key: "follow_through",
      name: n("إنجاز المتابعات", "Follow-through"),
      items: [
        { key: "on_time", metric: "followup_on_time_pct", name: n("المتابعات المغلقة في موعدها", "Follow-ups closed on time"), bands: [b(90, null, 12), b(75, 90, 9), b(60, 75, 5), b(null, 60, 1)] },
        { key: "overdue", metric: "overdue_open", name: n("المتابعات المتأخرة المفتوحة نهاية الشهر", "Overdue items open at month end"), bands: [b(null, 1, 6), b(1, 3, 4), b(3, 6, 2), b(6, null, 0)] },
      ],
    },
    {
      key: "coordination",
      name: n("التنسيق مع الأقسام", "Coordination with departments"),
      items: [{ key: "answers", metric: "department_answer_pct", name: n("الطلبات التي حصلت على رد القسم في موعدها", "Requests answered by departments on time"), bands: [b(85, null, 10), b(70, 85, 7), b(50, 70, 4), b(null, 50, 1)] }],
    },
    {
      key: "documentation",
      name: n("التوثيق والدقة", "Documentation & accuracy"),
      items: [
        { key: "minutes", metric: "minutes_24h_pct", name: n("محاضر الاجتماعات خلال 24 ساعة", "Meeting minutes within 24 h"), bands: [b(90, null, 6), b(70, 90, 4), b(50, 70, 2), b(null, 50, 0)] },
        { key: "correspondence", metric: "correspondence_linked_pct", name: n("المراسلات الموثّقة بالملف أو الرابط", "Correspondence logged with its file"), bands: [b(90, null, 4), b(70, 90, 3), b(50, 70, 1), b(null, 50, 0)] },
        { key: "intake", metric: "intake_complete_pct", name: n("استمارات المشاريع المكتملة", "Complete project forms"), bands: [b(90, null, 5), b(75, 90, 3), b(50, 75, 1), b(null, 50, 0)] },
      ],
    },
    {
      key: "discipline",
      name: n("انتظام العمل اليومي", "Daily discipline"),
      items: [{ key: "activity", metric: "activity_days_pct", name: n("أيام تسجيل العمل في النظام", "Days with work logged"), bands: [b(90, null, 6), b(75, 90, 4), b(50, 75, 2), b(null, 50, 0)] }],
    },
    {
      key: "ceo_rating",
      name: n("تقييم المدير التنفيذي", "CEO's rating"),
      items: [{ key: "rating", metric: "ceo_rating_pct", name: n("الاحترافية والدقة والتواصل والسرية والمبادرة", "Professionalism, accuracy, communication, confidentiality, initiative"), bands: [b(90, null, 15), b(75, 90, 11), b(60, 75, 7), b(40, 60, 3), b(null, 40, 0)] }],
    },
  ],
};

// The CEO rates the office monthly on these (1–5 each), like department managers.
export const OFFICE_RATING_CRITERIA = [
  { key: "professionalism", name: n("الاحترافية", "Professionalism") },
  { key: "accuracy", name: n("الدقة", "Accuracy") },
  { key: "communication", name: n("التواصل", "Communication") },
  { key: "confidentiality", name: n("السرية", "Confidentiality") },
  { key: "initiative", name: n("المبادرة", "Initiative") },
];

const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : null);
const ms = (d) => (d ? new Date(d).getTime() : null);
const inMonth = (d, from, to) => {
  const t = ms(d);
  return t !== null && t >= from && t < to;
};
const idOf = (v) => (v ? String(v._id || v) : null);

// Intake fields a complete form always has (the Word form's client and project boxes).
export const INTAKE_KEY_FIELDS = [
  (i) => i.client?.name,
  (i) => i.client?.phone,
  (i) => i.client?.receivedAt,
  (i) => i.client?.requiredDelivery,
  (i) => i.project?.name,
  (i) => i.project?.location,
  (i) => (i.project?.types || []).length,
];
export const intakeComplete = (i) => INTAKE_KEY_FIELDS.every((f) => Boolean(f(i)));

/**
 * One person's office values for the month.
 * @param userId
 * @param range { from, to } ms — the month (office time)
 * @param data  { items, interactions, leads, meetings, correspondence, intakes, activeDays,
 *                presentDays, rating (0–100 or null), now }
 *   items: OfficeItem (createdBy, kind, due, status, closedAt, sentAt, firstResponseAt)
 *   interactions: { by, at, callback, callbackDoneAt, lead }
 *   leads: { createdBy, createdAt, firstContactAt }
 *   meetings: { organizer, status, end, minutesAt }
 *   correspondence: { createdBy, date|createdAt, attachments, links }
 *   intakes: { createdBy, createdAt, ...form }
 *   activeDays: Set of "YYYY-MM-DD" she logged something on; presentDays: number
 */
export function officeValues(userId, range, data) {
  const { from, to } = range;
  const me = (v) => idOf(v) === String(userId);
  const now = data.now ?? Date.now();
  const end = Math.min(to, now);

  // Responsiveness: inquiries she logged and calls waiting for a return call.
  const leads = (data.leads || []).filter((l) => me(l.createdBy) && inMonth(l.createdAt, from, to));
  const callbacks = (data.interactions || []).filter((x) => me(x.by) && x.callback && inMonth(x.at, from, to));
  const within24 = (start, done) => done !== null && done - start <= 24 * HOUR;
  const answered = leads.filter((l) => within24(ms(l.createdAt), ms(l.firstContactAt))).length + callbacks.filter((x) => within24(ms(x.at), ms(x.callbackDoneAt))).length;
  // Not yet 24 h old at month end: not counted either way.
  const judged = leads.filter((l) => ms(l.firstContactAt) !== null || end - ms(l.createdAt) > 24 * HOUR).length + callbacks.filter((x) => ms(x.callbackDoneAt) !== null || end - ms(x.at) > 24 * HOUR).length;

  // Follow-through: her items whose date fell in the month.
  const mine = (data.items || []).filter((i) => me(i.createdBy) && i.kind !== "admin_request");
  const dueNow = mine.filter((i) => i.status !== "cancelled" && inMonth(i.due, from, Math.min(to, now)));
  const onTime = dueNow.filter((i) => i.status === "done" && ms(i.closedAt) !== null && ms(i.closedAt) <= ms(i.due)).length;
  const overdueOpen = mine.filter((i) => !["done", "cancelled"].includes(i.status) && ms(i.due) !== null && ms(i.due) < end).length;

  // Coordination: requests she sent to departments, due this month.
  const requests = mine.filter((i) => i.kind === "request" && i.sentAt && i.status !== "cancelled" && inMonth(i.due, from, Math.min(to, now)));
  const gotAnswer = requests.filter((i) => {
    const answer = ms(i.firstResponseAt) ?? (i.status === "done" ? ms(i.closedAt) : null);
    return answer !== null && answer <= ms(i.due);
  }).length;

  // Documentation.
  const held = (data.meetings || []).filter((m) => me(m.organizer) && m.status === "held" && inMonth(m.end, from, to) && end - ms(m.end) > 24 * HOUR);
  const minutesOnTime = held.filter((m) => ms(m.minutesAt) !== null && ms(m.minutesAt) - ms(m.end) <= 24 * HOUR).length;
  const letters = (data.correspondence || []).filter((c) => me(c.createdBy) && inMonth(c.date || c.createdAt, from, to));
  const linked = letters.filter((c) => (c.attachments || []).length || (c.links || []).length).length;
  const forms = (data.intakes || []).filter((i) => me(i.createdBy) && inMonth(i.createdAt, from, to));
  const completeForms = forms.filter(intakeComplete).length;

  // Daily discipline.
  const activeDays = data.activeDays ? data.activeDays.size : 0;
  const presentDays = data.presentDays || 0;

  return {
    response_24h_pct: pct(answered, judged),
    followup_on_time_pct: pct(onTime, dueNow.length),
    overdue_open: mine.length ? overdueOpen : null,
    department_answer_pct: pct(gotAnswer, requests.length),
    minutes_24h_pct: pct(minutesOnTime, held.length),
    correspondence_linked_pct: pct(linked, letters.length),
    intake_complete_pct: pct(completeForms, forms.length),
    activity_days_pct: presentDays ? Math.min(100, pct(activeDays, presentDays)) : null,
    ceo_rating_pct: data.rating ?? null,
    _counts: { inquiries: leads.length, callbacks: callbacks.length, due: dueNow.length, overdue: overdueOpen, requests: requests.length, meetings: held.length, letters: letters.length, forms: forms.length, activeDays, presentDays },
  };
}
