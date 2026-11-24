import { officeValues, intakeComplete } from "../lib/kpi/office.js";
import { computeKpi } from "../lib/kpi/engine.js";
import { DEFAULT_KPI } from "../lib/kpi/config.js";
import { canMove, dueFromChip, isOverdue, itemCode, whatsappLink, correspondenceCode } from "../lib/office.js";

let fails = 0;
const ok = (name, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"} ${name} ${c ? "" : x}`); if (!c) fails++; };

const H = 3600000;
const d = (day, h = 10) => new Date(Date.UTC(2026, 9, day, h));
const range = { from: d(1, 0).getTime(), to: new Date(Date.UTC(2026, 10, 1)).getTime() };
const S = "sec";

// ---- the office's values for a month ----
const v = officeValues(S, range, {
  now: new Date(Date.UTC(2026, 10, 5)).getTime(),
  leads: [
    { createdBy: S, createdAt: d(3), firstContactAt: new Date(d(3).getTime() + 2 * H) }, // answered in 2 h
    { createdBy: S, createdAt: d(4), firstContactAt: new Date(d(4).getTime() + 50 * H) }, // too late
    { createdBy: "other", createdAt: d(4), firstContactAt: null }, // not hers
  ],
  interactions: [
    { by: S, at: d(6), callback: true, callbackDoneAt: new Date(d(6).getTime() + 3 * H) }, // returned in time
    { by: S, at: d(7), callback: true, callbackDoneAt: null }, // never returned
    { by: S, at: d(8), callback: false },
  ],
  items: [
    { createdBy: S, kind: "followup", due: d(10), status: "done", closedAt: d(9) }, // on time
    { createdBy: S, kind: "followup", due: d(11), status: "done", closedAt: d(12) }, // late
    { createdBy: S, kind: "followup", due: d(12), status: "open" }, // overdue, still open
    { createdBy: S, kind: "request", due: d(15), status: "done", sentAt: d(13), firstResponseAt: d(14), closedAt: d(16) }, // answered in time
    { createdBy: S, kind: "request", due: d(15), status: "sent", sentAt: d(13) }, // no answer, overdue
    { createdBy: S, kind: "admin_request", due: d(15), status: "open" }, // employees' requests aren't hers to score
    { createdBy: S, kind: "followup", due: d(20), status: "cancelled" }, // cancelled: left out
  ],
  meetings: [
    { organizer: S, status: "held", end: d(18), minutesAt: new Date(d(18).getTime() + 5 * H) }, // minutes in time
    { organizer: S, status: "held", end: d(19), minutesAt: null }, // no minutes
    { organizer: S, status: "scheduled", end: d(25) },
  ],
  correspondence: [
    { createdBy: S, date: "2026-10-05", attachments: [{ url: "/x" }] },
    { createdBy: S, date: "2026-10-06", links: ["https://drive.google.com/x"] },
    { createdBy: S, date: "2026-10-07" },
  ],
  intakes: [
    { createdBy: S, createdAt: d(3), client: { name: "A", phone: "1", receivedAt: "2026-10-03", requiredDelivery: "2026-11-01" }, project: { name: "P", location: "L", types: ["interior"] } },
    { createdBy: S, createdAt: d(4), client: { name: "B" }, project: { name: "Q", types: [] } },
  ],
  activeDays: new Set(["2026-10-01", "2026-10-02", "2026-10-05"]),
  presentDays: 4,
  rating: 80,
});
ok("responses within 24 h: 2 of 4", v.response_24h_pct === 50, String(v.response_24h_pct));
ok("follow-ups closed on time: 1 of 5 due (cancelled left out; a request closed after its date is late)", v.followup_on_time_pct === 20, String(v.followup_on_time_pct));
ok("overdue items open at month end: 2", v.overdue_open === 2, String(v.overdue_open));
ok("department answers on time: 1 of 2", v.department_answer_pct === 50, String(v.department_answer_pct));
ok("minutes within 24 h: 1 of 2 held", v.minutes_24h_pct === 50, String(v.minutes_24h_pct));
ok("correspondence with its file: 2 of 3", v.correspondence_linked_pct === 66.7, String(v.correspondence_linked_pct));
ok("complete intake forms: 1 of 2", v.intake_complete_pct === 50, String(v.intake_complete_pct));
ok("days with work logged: 3 of 4", v.activity_days_pct === 75, String(v.activity_days_pct));
ok("the CEO's rating passes through", v.ceo_rating_pct === 80);
ok("a complete intake form is recognised", intakeComplete({ client: { name: "A", phone: "1", receivedAt: "x", requiredDelivery: "y" }, project: { name: "P", location: "L", types: ["t"] } }));

// A quiet month: nothing to measure → null (left out, not zero).
const quiet = officeValues(S, range, { now: range.to, items: [], leads: [], interactions: [], meetings: [], correspondence: [], intakes: [], activeDays: new Set(), presentDays: 0 });
ok("nothing to measure → no value", quiet.minutes_24h_pct === null && quiet.followup_on_time_pct === null && quiet.response_24h_pct === null);

// ---- the engine: the office is scored on its own indicators and kept out of the race ----
const res = computeKpi({
  users: [{ id: "e", department: "d" }, { id: S, department: "d" }],
  attendance: { e: { workedHours: 100, shortHours: 0, lateCount: 0, warnings: 0 }, [S]: { workedHours: 100, shortHours: 0, lateCount: 0, warnings: 0 } },
  tasks: [{ kind: "task", type: "cad", revision: 0, assignee: "e", status: "approved", dueAt: d(10), submittedAt: d(9), activeMs: 3600000, maxHours: 4, ratings: [] }],
  config: DEFAULT_KPI,
  ratingTags: [],
  bonusPool: 1000,
  office: { [S]: v },
});
const sec = res.results.find((r) => r.userId === S);
const eng = res.results.find((r) => r.userId === "e");
ok("the office gets the attendance + office indicators", sec.indicators.map((i) => i.key).join(",") === "attendance,responsiveness,follow_through,coordination,documentation,discipline,ceo_rating", sec.indicators.map((i) => i.key).join(","));
ok("the office takes no bonus", sec.bonus === 0 && sec.bonusExcluded && sec.profile === "office");
ok("the office is ranked among itself", sec.rank === 1 && sec.of === 1);
ok("the engineer keeps the whole race", eng.rank === 1 && eng.of === 1 && eng.bonus > 0, JSON.stringify({ rank: eng.rank, of: eng.of, bonus: eng.bonus }));
ok("office score is 0–100", sec.score >= 0 && sec.score <= 100, String(sec.score));
const quietRes = computeKpi({ users: [{ id: S, department: "d" }], attendance: { [S]: { workedHours: 100, shortHours: 0, lateCount: 0, warnings: 0 } }, tasks: [], config: DEFAULT_KPI, ratingTags: [], office: { [S]: quiet } });
ok("a quiet month isn't punished: only attendance counts", quietRes.results[0].score === 100, String(quietRes.results[0].score));

// ---- items and helpers ----
ok("the office sends an open item", canMove({ status: "open" }, "sent", "office"));
ok("the department acknowledges and closes", canMove({ status: "sent" }, "acknowledged", "receiver") && canMove({ status: "acknowledged" }, "done", "receiver"));
ok("the department can't cancel or reopen", !canMove({ status: "sent" }, "cancelled", "receiver") && !canMove({ status: "done" }, "open", "receiver"));
ok("the office reopens a closed item", canMove({ status: "done" }, "open", "office"));
ok("overdue only while open", isOverdue({ status: "open", due: d(1) }, d(2).getTime()) && !isOverdue({ status: "done", due: d(1) }, d(2).getTime()));
ok("date chips", dueFromChip("tomorrow", "2026-10-31").toISOString().startsWith("2026-11-01") && dueFromChip("week", "2026-10-01").toISOString().startsWith("2026-10-08") && dueFromChip("", "2026-10-01") === null);
ok("codes", itemCode(42) === "OF-0042" && correspondenceCode("in", 2026, 7) === "IN-2026-0007");
ok("WhatsApp links", whatsappLink("+963 944 123 456") === "https://wa.me/963944123456" && whatsappLink("0096350") === "" && whatsappLink("00963944123456") === "https://wa.me/963944123456");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
