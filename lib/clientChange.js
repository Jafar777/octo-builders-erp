// A change the client asks for after work was approved. Approved work is never
// un-approved: new revisions open for what is affected, in order. Pure functions (no
// database), shared by the server (lib/clientChangeServer.js), the screens and the tests.
import { addWorkHours, heldSpan, HOLDING_STATUSES, isRedo, nextWorkMoment, officeDaySpan, placeTask, readyTime, taskSpan, taskWorkMs, untangle } from "./gantt.js";
import { stageAfter } from "./stageFlow.js";

const idStr = (v) => (v ? String(v._id || v) : null);
const WORK_KINDS = ["task", "revision"];
const RUNNING = ["in_progress", "on_hold", "help"];

// What the CEO may choose for an affected task, by its status; the first is suggested.
// Approved work has no suggestion: the CEO decides on each.
export const ACTIONS = {
  todo: ["wait", "none"],
  running: ["warn", "pause", "none"],
  submitted: ["hold", "revise", "none"],
  approved: ["revise", "check", "none"],
};
export const statusGroup = (status) => (RUNNING.includes(status) ? "running" : status);
export const actionsFor = (status) => ACTIONS[statusGroup(status)] || [];
export const suggestedAction = (status) => (status === "approved" ? "" : actionsFor(status)[0] || "");
export const CHECK_HOURS = 1;

// Revision chains (R-00, R-01…): each chain is one piece of work, shown by its latest
// live task. Returns { chainOf: {taskId: chainId}, chains: {chainId: {members, leaf}} }.
export function buildChains(tasks) {
  const list = tasks.filter((t) => WORK_KINDS.includes(t.kind) && t.status !== "cancelled");
  const byId = new Map(list.map((t) => [idStr(t), t]));
  const rootOf = (t) => {
    let cur = t;
    for (let i = 0; i < 50 && cur.previousTask && byId.has(idStr(cur.previousTask)); i += 1) cur = byId.get(idStr(cur.previousTask));
    return idStr(cur);
  };
  const chains = {};
  const chainOf = {};
  for (const t of list) {
    const key = rootOf(t);
    chainOf[idStr(t)] = key;
    (chains[key] ||= { members: [] }).members.push(t);
  }
  for (const c of Object.values(chains)) {
    const parents = new Set(c.members.map((m) => idStr(m.previousTask)).filter(Boolean));
    const leaves = c.members.filter((m) => !parents.has(idStr(m)));
    c.leaf = leaves.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || c.members[0];
  }
  return { chainOf, chains };
}

// Everything built on `rootId`, directly or not: by task links (to any revision of a
// task) and by the project's stage order. up[chain] = the chains it builds on;
// affected = [{ chain, task }] in working order.
export function findAffected(rootId, tasks, project = null) {
  const { chainOf, chains } = buildChains(tasks);
  const rootChain = chainOf[idStr(rootId)] || null;
  const up = Object.fromEntries(Object.keys(chains).map((k) => [k, new Set()]));
  if (!rootChain) return { rootChain, chainOf, chains, up, affected: [] };
  for (const [key, c] of Object.entries(chains)) {
    for (const m of c.members) for (const d of m.dependsOn || []) if (chainOf[idStr(d)] && chainOf[idStr(d)] !== key) up[key].add(chainOf[idStr(d)]);
  }
  if (project?.stages?.length) {
    const inStage = {};
    for (const [key, c] of Object.entries(chains)) if (c.leaf.stage && idStr(c.leaf.project) === idStr(project)) (inStage[c.leaf.stage] ||= []).push(key);
    project.stages.forEach((s, i) => {
      for (const before of stageAfter(project.stages, i)) for (const k of inStage[s.key] || []) for (const b of inStage[before] || []) if (b !== k) up[k].add(b);
    });
  }
  const down = {};
  for (const [k, set] of Object.entries(up)) for (const u of set) (down[u] ||= []).push(k);
  const reach = new Set([rootChain]);
  const queue = [rootChain];
  while (queue.length) {
    for (const k of down[queue.shift()] || []) {
      if (reach.has(k)) continue;
      reach.add(k);
      queue.push(k);
    }
  }
  // Working order: a task after everything it builds on.
  const order = [];
  const seen = new Set();
  const visit = (k) => {
    if (seen.has(k) || !reach.has(k)) return;
    seen.add(k);
    for (const u of up[k]) visit(u);
    order.push(k);
  };
  for (const k of reach) visit(k);
  const affected = order.filter((k) => k !== rootChain && actionsFor(chains[k].leaf.status).length).map((k) => ({ chain: k, task: chains[k].leaf }));
  return { rootChain, chainOf, chains, up, affected };
}

// The new tasks a piece of work must wait for: the nearest renewed work it builds on.
// Work that isn't renewed is looked through, unless it hasn't started and waits itself.
export function nearestNew(chain, up, renewed, actions) {
  const out = new Set();
  const seen = new Set([chain]);
  const walk = (k) => {
    for (const u of up[k] || []) {
      if (seen.has(u)) continue;
      seen.add(u);
      if (renewed[u]) out.add(renewed[u]);
      else if (actions[u] !== "wait") walk(u);
    }
  };
  walk(chain);
  return [...out];
}

// The plan after adding `fresh` ([{ ...task, hours }] in working order): where each goes
// and what it moves, the way insertRedo / clearOverlaps / cascadeFrom do it. `work` =
// every dated unfinished task (changed links already set); `others` = other tasks they
// wait for. Returns { spans: {freshId: {start, end}}, moves: [{ task, from, to }] }.
export async function simulatePlan({ work, others = [], fresh, cal, calendarOf, now = Date.now() }) {
  const live = new Map(work.map((t) => [idStr(t), { ...t }]));
  const rest = new Map(others.map((t) => [idStr(t), t]));
  const before = new Map(work.map((t) => [idStr(t), taskSpan(t)]));
  const get = (id) => live.get(idStr(id)) || rest.get(idStr(id));
  const put = (t, span) => {
    t.plannedStart = new Date(span.start);
    t.dueAt = new Date(span.end);
  };
  const movable = (t) => t.status === "todo" && t.kind !== "meeting" && !t.fixed;

  const clear = async (assignee) => {
    const pc = await calendarOf(idStr(assignee));
    const mine = [...live.values()].filter((t) => idStr(t.assignee) === idStr(assignee) && HOLDING_STATUSES.includes(t.status) && t.plannedStart && t.dueAt);
    const next = untangle(
      [...mine.filter((t) => !movable(t)).map(heldSpan), ...(pc.leaveDays || []).map((iso) => officeDaySpan(iso, pc))],
      mine.filter(movable).map((t) => {
        const span = taskSpan(t);
        return { id: idStr(t), span, workMs: taskWorkMs(t, pc, span), priority: isRedo(t) ? "redo" : t.priority };
      }),
      pc
    );
    const moved = [];
    for (const [id, span] of next) {
      const t = live.get(id);
      const was = taskSpan(t);
      if (was.start === span.start && was.end === span.end) continue;
      put(t, span);
      moved.push(id);
    }
    return moved;
  };
  const cascade = async (ids) => {
    const queue = [...ids];
    for (let guard = 0; queue.length && guard < 1000; guard += 1) {
      const id = queue.shift();
      for (const t of [...live.values()].filter((x) => movable(x) && (x.dependsOn || []).some((d) => idStr(d) === id))) {
        const preds = t.dependsOn.map(get).filter((p) => p && p.status !== "cancelled");
        if (!preds.length) continue;
        const ready = Math.max(...preds.map((p) => readyTime(p, cal, now)));
        const span = taskSpan(t);
        if (span.start >= ready) continue;
        const pc = await calendarOf(idStr(t.assignee));
        put(t, placeTask(Math.max(ready, now), taskWorkMs(t, pc, span), pc));
        queue.push(idStr(t), ...(await clear(t.assignee)));
      }
    }
  };

  for (const f of fresh) {
    const t = { ...f, status: "todo" };
    const pc = await calendarOf(idStr(t.assignee));
    const preds = (t.dependsOn || []).map(get).filter((p) => p && p.status !== "cancelled");
    const running = [...live.values()].filter((x) => idStr(x.assignee) === idStr(t.assignee) && RUNNING.includes(x.status) && x.kind !== "meeting");
    const start = nextWorkMoment(Math.max(now, ...preds.map((p) => readyTime(p, cal, now)), ...running.map((x) => heldSpan(x).end)), pc);
    put(t, { start, end: addWorkHours(start, t.hours, pc) });
    live.set(idStr(t), t);
    await cascade([idStr(t), ...(await clear(t.assignee))]);
  }

  const freshIds = new Set(fresh.map(idStr));
  const spans = {};
  const moves = [];
  for (const [id, t] of live) {
    const span = taskSpan(t);
    if (freshIds.has(id)) spans[id] = { start: span.start, end: span.end };
    else {
      const was = before.get(id);
      if (was.start !== span.start || was.end !== span.end) moves.push({ task: t, from: was, to: { start: span.start, end: span.end } });
    }
  }
  return { spans, moves };
}

export const hoursOk = (h) => Number.isFinite(h) && h >= 0.5 && h <= 500;
export const roundHours = (h) => Math.round(Number(h) * 2) / 2;
export const taskHours = (t) => roundHours(t.maxHours || t.estimatedHours || 0) || 1;
