// The hybrid way of working: the CEO plans tasks ahead, and employees also start work
// themselves ("Start work"). Both lead to the same task records. Pure functions, shared
// by the browser and the server (the database side is lib/hybridServer.js).

export const HYBRID_DEFAULTS = {
  // { departmentId: ISO date it was switched on }: the employees of these departments
  // may start work themselves. Off until the CEO switches a department on.
  departments: {},
  // How far an employee may change the suggested hours before the manager confirms.
  adjustPct: 25,
  // First month ("YYYY-MM") the fair KPI rules count from; "" = not yet.
  kpiFrom: "",
  // Running tasks stop at the end of the working day.
  endOfDay: true,
  // Suggested hours per kind of work, until there's enough real history here.
  hours: { cad: 4, max: 5, test_render: 3, final_render: 3, shop_drawings: 5, details: 4, checking: 2, boq: 4, site_analysis: 3, presentation: 4, animation: 8, ai_edit: 2, graphics_edit: 2, bim: 6, other: 3 },
};

const idStr = (v) => (v ? v.toString() : null);

export const hybridOn = (settings, departmentId) => Boolean(departmentId && settings?.departments?.[idStr(departmentId)]);

// Why finished work is done again. Only "customer" needs the client-change process.
export const AGAIN_REASONS = ["improvement", "correction", "customer"];

const half = (h) => Math.max(0.5, Math.round(h * 2) / 2);

// The median of what similar work really took, when there's enough of it.
export function suggestHours({ mine = [], all = [], fallback = 3 }) {
  const median = (list) => {
    const s = [...list].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  if (mine.length >= 3) return half(median(mine));
  if (all.length >= 5) return half(median(all));
  return half(fallback);
}

// What an employee may take without asking.
export const hoursLimit = (suggested, pct) => half(suggested * (1 + Math.max(0, pct) / 100));

// The hours that count now, and what waits for the manager (null = nothing).
export function acceptHours(asked, suggested, pct) {
  const want = half(Math.min(200, Number(asked) || suggested));
  const limit = hoursLimit(suggested, pct);
  return want > limit ? { hours: limit, pending: want } : { hours: want, pending: null };
}

// One piece of work: a project's stage, and within it the room / drawing.
export function placeKey(project, stage, title) {
  const text = String(title || "")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return `${idStr(project)}|${stage}|${text}`;
}

// What pressing "Start work" on a piece of work means, from what already exists there.
// `tasks`: the tasks of that place (kind task / revision). → { outcome, task? }
//   resume    mine, already going             planned   mine, waiting: start that one
//   redo      mine, rejected and waiting      working   a colleague is on it
//   taken     waiting for a colleague         review    handed in, being reviewed
//   again     approved: say why               rejected  rejected with no redo yet
//   new       nothing there
export function placeOutcome(tasks, userId) {
  const live = tasks.filter((t) => t.status !== "cancelled");
  const mine = (t) => idStr(t.assignee) === userId;
  const pick = (f) => live.find(f);
  const going = (t) => ["in_progress", "on_hold", "help"].includes(t.status);
  let t = pick((x) => going(x) && mine(x));
  if (t) return { outcome: "resume", task: t };
  t = pick((x) => x.status === "todo" && mine(x));
  if (t) return { outcome: t.revision > 0 ? "redo" : "planned", task: t };
  t = pick(going);
  if (t) return { outcome: "working", task: t };
  t = pick((x) => x.status === "todo");
  if (t) return { outcome: "taken", task: t };
  t = pick((x) => x.status === "submitted");
  if (t) return { outcome: "review", task: t };
  const latest = [...live].sort((a, b) => (b.revision || 0) - (a.revision || 0) || new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
  if (!latest) return { outcome: "new" };
  if (latest.status === "rejected") return { outcome: "rejected", task: latest };
  return { outcome: "again", task: latest };
}

// A promise date only moves for reasons outside the employee's control: someone else
// moved the plan, or the work waits for a colleague's. Their own late start, overrun or
// self-started work never moves it.
export function promiseMoves({ actorId, assigneeId, byAssigneeId = null, pulled = false }) {
  if (pulled) return false;
  if (byAssigneeId) return byAssigneeId !== assigneeId;
  return Boolean(actorId) && actorId !== assigneeId;
}
