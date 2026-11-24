// A client's change after approval, server side (lib/clientChange.js has the pure rules):
// who may ask / confirm, what it touches, the preview, and carrying it out at once.
import mongoose from "mongoose";
import { audit } from "@/lib/audit";
import { HOLDING_STATUSES, HOUR, workMsBetween } from "@/lib/gantt";
import { getWorkCalendar, personCalendar } from "@/lib/ganttServer";
import { actionsFor, CHECK_HOURS, findAffected, hoursOk, nearestNew, roundHours, simulatePlan, suggestedAction, taskHours } from "@/lib/clientChange";
import { notify, usersWithPermission } from "@/lib/notify";
import { DEFAULT_ROLE, HIDDEN_ROLES, isTopRole, TOP_ROLES } from "@/lib/permissions";
import { projectEnd, replanPaused, trackDelays } from "@/lib/projectDelay";
import { canRouteStages, checkStageHandoffs } from "@/lib/projects";
import { canManageTask, enrichTask, enrichTasks, logActivity, managesAssignee, publishTaskChange, taskTitle } from "@/lib/tasks";
import { NAME_FIELDS, pickName, viewerLang } from "@/lib/personName";
import { nextNumber } from "@/models/Counter";
import ClientChange from "@/models/ClientChange";
import Role from "@/models/Role";
import Task from "@/models/Task";
import User from "@/models/User";
import WorkProject from "@/models/WorkProject";

const idStr = (v) => (v ? String(v._id || v) : null);
const clip = (v, n) => String(v || "").trim().slice(0, n);
const WORK_KINDS = ["task", "revision"];
export const changeCode = (n) => `CC-${String(n).padStart(4, "0")}`;

// Asking: whoever manages the task. Confirming when other tasks are touched: the CEO.
export const canConfirmChange = (user) => Boolean(user?.isStaff && isTopRole(user.role));
export const canAskChange = async (user, task) => Boolean(user?.isStaff && !user.limited && (canRouteStages(user) || canManageTask(user, task) || (await managesAssignee(user, task))));
export const canSeeBilling = (user) => canConfirmChange(user) || Boolean(user?.permissions?.includes("invoices.manage"));

// Why this task can't get a change now, or null.
async function refusal(task) {
  if (task.status !== "approved" || !WORK_KINDS.includes(task.kind)) return "invalid_transition";
  // Help given on it and a cancelled revision aren't later versions of it.
  if (await Task.exists({ previousTask: task._id, kind: { $ne: "help" }, status: { $ne: "cancelled" } })) return "revision_exists";
  if (task.project) {
    const p = await WorkProject.findById(task.project, { status: 1 }).lean();
    if (p && ["on_hold", "archived"].includes(p.status)) return "client_change_project_stopped";
  }
  return null;
}

// The task's project work, plus whatever waits for it in other projects.
async function loadGraph(task) {
  const base = { kind: { $in: WORK_KINDS }, status: { $ne: "cancelled" } };
  const found = new Map();
  const add = (list) => list.filter((t) => !found.has(idStr(t))).map((t) => (found.set(idStr(t), t), t));
  if (task.project) add(await Task.find({ ...base, project: task.project }).lean());
  add(await Task.find({ ...base, _id: task._id }).lean());
  let frontier = [...found.values()];
  for (let i = 0; frontier.length && i < 30; i += 1) {
    const ids = frontier.map((t) => t._id);
    const before = frontier.map((t) => t.previousTask).filter(Boolean);
    frontier = add(await Task.find({ ...base, $or: [{ dependsOn: { $in: ids } }, { previousTask: { $in: ids } }, { _id: { $in: before } }] }).lean());
  }
  const project = task.project ? await WorkProject.findById(task.project).lean() : null;
  return { ...findAffected(task._id, [...found.values()], project), project };
}

const titleOf = (t) => ({ id: t.id, number: t.number, title: taskTitle(t), stage: t.stage, projectName: t.project?.name || null, revision: t.revision, status: t.status, assignee: t.assignee ? { id: t.assignee.id, name: t.assignee.name, avatarUrl: t.assignee.avatarUrl || "" } : null });

const serializeRequest = (c) => ({ id: idStr(c), code: changeCode(c.number), summary: c.summary, createdAt: c.createdAt });

// What the screen needs to set up a change.
export async function changeSetup(user, task) {
  const error = await refusal(task);
  if (error) return { error };
  const g = await loadGraph(task);
  const enriched = await enrichTasks([task.toObject(), ...g.affected.map((a) => a.task)]);
  const pending = await ClientChange.findOne({ task: task._id, status: "pending" }).lean();
  return {
    task: { ...titleOf(enriched[0]), hours: taskHours(task) },
    affected: g.affected.map((a, i) => ({ ...titleOf(enriched[i + 1]), hours: taskHours(a.task), actions: actionsFor(a.task.status), suggested: suggestedAction(a.task.status) })),
    canConfirm: canConfirmChange(user),
    canSetHours: canRouteStages(user),
    pending: pending ? serializeRequest(pending) : null,
  };
}

// The people a new revision may be given to.
async function validAssignee(id) {
  if (!mongoose.isValidObjectId(id)) return false;
  const u = await User.findOne({ _id: id, status: "active", role: { $nin: [DEFAULT_ROLE, ...HIDDEN_ROLES, ...TOP_ROLES] } }, { role: 1 }).lean();
  if (!u) return false;
  const role = await Role.findOne({ key: u.role }, { limited: 1 }).lean();
  return Boolean(role && !role.limited);
}

// Works out the whole change without saving anything. body = { summary, hours,
// assigneeId, items: [{ taskId, status, action, hours, assigneeId }] }.
async function buildPlan(user, task, body) {
  const error = await refusal(task);
  if (error) return { error };
  const summary = clip(body.summary, 2000);
  if (!summary) return { error: "client_change_summary" };
  const g = await loadGraph(task);
  if (g.affected.length && !canConfirmChange(user)) return { error: "client_change_ceo" };

  const asked = new Map((Array.isArray(body.items) ? body.items : []).map((i) => [String(i?.taskId), i]));
  const planner = canRouteStages(user);
  const actions = {}; // chain → action
  const rows = [];
  for (const { chain, task: t } of g.affected) {
    const i = asked.get(idStr(t));
    // Something changed since the screen opened: look again before deciding.
    if (!i || i.status !== t.status) return { error: "client_change_stale" };
    if (!actionsFor(t.status).includes(i.action)) return { error: "client_change_choose" };
    actions[chain] = i.action;
    rows.push({ chain, task: t, action: i.action, input: i });
  }

  // New work, in working order.
  const renewed = {}; // chain → the new task's id
  const fresh = [];
  const make = async (chain, t, input, action) => {
    const check = action === "check";
    let hours = check ? CHECK_HOURS : taskHours(t);
    if (planner && input.hours !== undefined && input.hours !== null && input.hours !== "") hours = roundHours(input.hours);
    if (!hoursOk(hours)) return "invalid_task_hours";
    let assignee = t.assignee;
    if (planner && input.assigneeId && String(input.assigneeId) !== idStr(t.assignee)) {
      if (!(await validAssignee(input.assigneeId))) return "client_change_assignee";
      assignee = new mongoose.Types.ObjectId(String(input.assigneeId));
    }
    const deps = chain === g.rootChain ? [] : nearestNew(chain, g.up, renewed, actions);
    const id = new mongoose.Types.ObjectId();
    fresh.push({
      _id: id,
      kind: check ? "personal" : t.project && t.stage ? "revision" : t.kind,
      priority: check ? "urgent" : t.priority,
      revision: check ? 0 : (t.revision || 0) + 1,
      assignee,
      dependsOn: deps.map((d) => new mongoose.Types.ObjectId(d)),
      estimatedHours: hours,
      hours,
      source: t,
      check,
    });
    renewed[chain] = idStr(id);
    return null;
  };
  const bad = await make(g.rootChain, task.toObject(), { hours: body.hours, assigneeId: body.assigneeId }, "revise");
  if (bad) return { error: bad };
  for (const r of rows) {
    if (!["revise", "check"].includes(r.action)) continue;
    const err = await make(r.chain, r.task, r.input, r.action);
    if (err) return { error: err };
    r.newTask = fresh.at(-1);
  }

  // How the existing tasks change.
  const rejectedChains = new Set(rows.filter((r) => r.action === "revise" && r.task.status === "submitted").map((r) => r.chain));
  const relink = {}; // taskId → its new dependsOn
  for (const r of rows) {
    const t = r.task;
    const waits = nearestNew(r.chain, g.up, renewed, actions);
    if (["hold", "pause"].includes(r.action)) r.waits = waits;
    if (t.status !== "todo") continue;
    if (r.action === "wait") {
      // Links to renewed work move to its new version; the rest stay.
      const kept = (t.dependsOn || []).map(idStr).filter((d) => !renewed[g.chainOf[d]]);
      relink[idStr(t)] = [...new Set([...kept, ...waits])];
    } else {
      // Not affected: it doesn't wait for this change, nor for work returned because of it.
      relink[idStr(t)] = (t.dependsOn || []).map(idStr).filter((d) => !rejectedChains.has(g.chainOf[d]));
    }
  }

  // The schedule, as it will be.
  const cal = await getWorkCalendar();
  const raw = await Task.find({ status: { $in: HOLDING_STATUSES }, plannedStart: { $ne: null }, dueAt: { $ne: null } }).lean();
  const returned = new Set(rows.filter((r) => rejectedChains.has(r.chain)).map((r) => idStr(r.task)));
  const work = raw.filter((t) => !returned.has(idStr(t))).map((t) => (relink[idStr(t)] ? { ...t, dependsOn: relink[idStr(t)] } : t));
  const inWork = new Set(work.map(idStr));
  const depIds = [...new Set(work.flatMap((t) => (t.dependsOn || []).map(idStr)))].filter((id) => !inWork.has(id) && !fresh.some((f) => idStr(f) === id));
  const others = await Task.find({ _id: { $in: depIds } }).lean();
  const calendarOf = (id) => personCalendar(id, cal);
  const { spans, moves } = await simulatePlan({ work, others, fresh, cal, calendarOf });

  // Delivery of every project this moves, before and after.
  const projectIds = [...new Set([idStr(task.project), ...fresh.map((f) => idStr(f.source.project)), ...moves.map((m) => idStr(m.task.project))].filter(Boolean))];
  const projectTasks = await Task.find({ project: { $in: projectIds }, kind: { $in: WORK_KINDS } }).lean();
  const newDates = Object.fromEntries(moves.map((m) => [idStr(m.task), m.to]));
  const deliveries = projectIds.map((pid) => {
    const now = projectTasks.filter((t) => idStr(t.project) === pid);
    const next = now
      .filter((t) => !returned.has(idStr(t)))
      .map((t) => (newDates[idStr(t)] ? { ...t, plannedStart: new Date(newDates[idStr(t)].start), dueAt: new Date(newDates[idStr(t)].end) } : t))
      .concat(fresh.filter((f) => !f.check && idStr(f.source.project) === pid).map((f) => ({ ...f, kind: "revision", status: "todo", plannedStart: new Date(spans[idStr(f)].start), dueAt: new Date(spans[idStr(f)].end) })));
    return { id: pid, from: projectEnd(now, cal), to: projectEnd(next, cal) };
  });

  return { summary, g, rows, fresh, relink, renewed, spans, moves, deliveries, returned, cal, extraHours: fresh.reduce((n, f) => n + f.hours, 0) };
}

// What will happen, for the CEO to look at before confirming.
export async function previewChange(user, task, body) {
  const plan = await buildPlan(user, task, body);
  if (plan.error) return plan;
  const lang = await viewerLang();
  const [people, projects, moved, sources] = await Promise.all([
    User.find({ _id: { $in: plan.fresh.map((f) => f.assignee) } }, NAME_FIELDS).lean(),
    WorkProject.find({ _id: { $in: plan.deliveries.map((d) => d.id) } }, { name: 1, code: 1, status: 1 }).lean(),
    enrichTasks(plan.moves.map((m) => m.task)),
    enrichTasks(plan.fresh.map((f) => f.source)),
  ]);
  const personName = Object.fromEntries(people.map((p) => [idStr(p), pickName(p, lang)]));
  const projectOf = Object.fromEntries(projects.map((p) => [idStr(p), p]));
  return {
    created: plan.fresh.map((f, i) => ({ number: f.source.number, title: taskTitle(sources[i]), check: f.check, revision: f.revision, assignee: personName[idStr(f.assignee)] || "", hours: f.hours, start: new Date(plan.spans[idStr(f)].start), end: new Date(plan.spans[idStr(f)].end) })),
    extraHours: plan.extraHours,
    deliveries: plan.deliveries.map((d) => ({ name: projectOf[d.id]?.name || null, main: d.id === idStr(task.project), from: d.from ? new Date(d.from) : null, to: d.to ? new Date(d.to) : null })),
    moves: plan.moves.map((m, i) => ({ number: m.task.number, title: taskTitle(moved[i]), assignee: moved[i].assignee?.name || "", from: new Date(m.from.start), to: new Date(m.to.start) })).sort((a, b) => a.to - b.to),
    reopens: projectOf[idStr(task.project)]?.status === "finished",
    paused: plan.rows.filter((r) => r.action === "pause").length,
  };
}

class Stale extends Error {}

// All of it or none of it. A database without transactions (a single local server) runs
// the same steps without one.
async function atomically(work) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(() => work(session));
  } catch (err) {
    if (err?.code === 20 || /Transaction numbers are only allowed/i.test(err?.message || "")) await work(null);
    else throw err;
  } finally {
    await session.endSession();
  }
}

async function tellCeo(change, task, actor) {
  const ceos = (await User.find({ status: "active", role: "ceo" }, { _id: 1 }).lean()).map(idStr);
  await notify({ type: "task.change_requested", recipients: ceos, actor, params: { actor: actor.name || actor.email, number: task.number, code: changeCode(change.number), text: change.summary.slice(0, 120) }, link: `/dashboard/tasks?task=${task._id}`, entityType: "task", entityId: task._id });
}

// A manager asks; the CEO decides.
export async function requestChange(user, task, body) {
  const error = await refusal(task);
  if (error) return { error };
  const summary = clip(body.summary, 2000);
  if (!summary) return { error: "client_change_summary" };
  let change;
  try {
    change = await ClientChange.create({ number: await nextNumber("client-change"), status: "pending", lock: idStr(task), project: task.project, task: task._id, summary, requestedBy: user.id });
  } catch (err) {
    if (err?.code === 11000) return { error: "client_change_open" };
    throw err;
  }
  await logActivity(task._id, user, "change_requested", summary, { code: changeCode(change.number) });
  await audit(user, "task.change_requested", { entityType: "task", entityId: task._id, summary: `#${task.number} ${changeCode(change.number)}` });
  await tellCeo(change, task, user);
  return { requested: true, code: changeCode(change.number) };
}

// The CEO turns a manager's request down.
export async function declineChange(user, task, body) {
  if (!canConfirmChange(user)) return { error: "client_change_ceo" };
  const change = await ClientChange.findOneAndUpdate({ task: task._id, status: "pending" }, { $set: { status: "declined", decidedBy: user.id, decidedAt: new Date(), declineReason: clip(body.reason, 500) }, $unset: { lock: 1 } });
  if (!change) return { error: "client_change_stale" };
  await notify({ type: "task.change_declined", recipients: [idStr(change.requestedBy)], actor: user, params: { number: task.number, code: changeCode(change.number), text: clip(body.reason, 120) }, link: `/dashboard/tasks?task=${task._id}`, entityType: "task", entityId: task._id });
  await audit(user, "task.change_declined", { entityType: "task", entityId: task._id, summary: changeCode(change.number) });
  return { ok: true };
}

// Takes the change on: the manager's open request, or a new one. Nobody else can run one
// on this task meanwhile.
async function takeLock(user, task, summary) {
  const open = await ClientChange.findOneAndUpdate({ task: task._id, status: "pending" }, { $set: { status: "applying", summary } }, { returnDocument: "after" });
  if (open) return { change: open, wasPending: true };
  try {
    return { change: await ClientChange.create({ number: await nextNumber("client-change"), status: "applying", lock: idStr(task), project: task.project, task: task._id, summary, requestedBy: user.id }), wasPending: false };
  } catch (err) {
    if (err?.code === 11000) return { error: "client_change_open" };
    throw err;
  }
}

export async function applyChange(user, task, body) {
  // Deciding on a manager's request is the CEO's, touching other tasks or not.
  if (!canConfirmChange(user) && (await ClientChange.exists({ task: task._id, status: "pending" }))) return { error: "client_change_open" };
  // A first look, so an incomplete form leaves no record behind.
  const first = await buildPlan(user, task, body);
  if (first.error) return first;
  const taken = await takeLock(user, task, first.summary);
  if (taken.error) return taken;
  const { change, wasPending } = taken;
  const release = () => (wasPending ? ClientChange.updateOne({ _id: change._id }, { $set: { status: "pending" } }) : ClientChange.deleteOne({ _id: change._id }));

  let plan;
  const numbers = {};
  const billing = canConfirmChange(user) && ["free", "paid"].includes(body.billing) ? body.billing : "";
  try {
    plan = await buildPlan(user, task, body);
    if (plan.error) {
      await release();
      return plan;
    }
    for (const f of plan.fresh) numbers[idStr(f)] = await nextNumber("task");
    await atomically((session) => save(session, user, task, plan, change, numbers, billing));
  } catch (err) {
    await release();
    if (err instanceof Stale) return { error: "client_change_stale" };
    throw err;
  }
  await afterwards(user, task, plan, change, numbers, billing).catch((err) => console.error("client change follow-up", err));
  return { ok: true, code: changeCode(change.number), revisionTaskId: plan.renewed[plan.g.rootChain] };
}

async function save(session, user, task, plan, change, numbers, billing) {
  const opts = session ? { session } : {};
  const now = new Date();
  const must = async (filter, update) => {
    const r = await Task.updateOne(filter, update, opts);
    if (!r.matchedCount) throw new Stale();
  };
  // Nobody touched the approved work meanwhile (and nobody can while this runs).
  await must({ _id: task._id, status: "approved" }, { $set: { updatedAt: now } });

  const note = `${changeCode(change.number)}: ${plan.summary}`;
  await Task.create(
    plan.fresh.map((f) => {
      const t = f.source;
      const span = plan.spans[idStr(f)];
      const common = { _id: f._id, number: numbers[idStr(f)], assignee: f.assignee, createdBy: user.id, project: t.project, department: t.department, type: t.type, priority: f.priority, dependsOn: f.dependsOn, plannedStart: new Date(span.start), dueAt: new Date(span.end), estimatedHours: f.hours, dueManual: true, description: note };
      if (f.check) return { ...common, kind: "personal", title: `✓ #${t.number} ${t.title || ""}`.trim() };
      return {
        ...common,
        kind: f.kind,
        title: t.title,
        stage: t.stage,
        revision: f.revision,
        revisionCause: "customer",
        previousTask: t._id,
        maxHours: f.hours,
        review: { manager: t.review?.manager ?? true, gm: Boolean(t.review?.gm), customer: Boolean(t.review?.customer) },
        externalReview: { hours: t.externalReview?.hours || 0 },
      };
    }),
    { ...opts, ordered: true }
  );

  const revisions = plan.fresh.filter((f) => !f.check).map((f) => f._id);
  for (const r of plan.rows) {
    const t = r.task;
    const same = { _id: t._id, status: t.status };
    const set = {};
    const push = {};
    if (plan.relink[idStr(t)]) set.dependsOn = plan.relink[idStr(t)];
    if (r.action === "none" && t.status === "todo") push.changeExempt = { $each: revisions };
    if (["hold", "pause"].includes(r.action)) push.waitsForChange = { $each: r.waits };
    if (r.action === "pause") {
      // Their clock stops here, like pressing pause.
      set.status = "on_hold";
      if (t.lastResumedAt) {
        set.activeMs = (t.activeMs || 0) + (now - new Date(t.lastResumedAt));
        set.lastResumedAt = null;
      }
      if (!t.pausedAt) set.pausedAt = now;
    }
    if (r.action === "revise" && t.status === "submitted") {
      Object.assign(set, { status: "rejected", rejectCause: "customer", reviewLevel: "", reviewedBy: user.id, reviewedAt: now, headNotes: note });
    }
    // Also proves the task is still as the CEO saw it.
    await must(same, { ...(Object.keys(push).length ? { $addToSet: push } : {}), $set: { ...set, updatedAt: now } });
  }
  // Work that moved to make room (only what still hasn't started).
  for (const m of plan.moves) {
    await Task.updateOne({ _id: m.task._id, status: "todo" }, { $set: { plannedStart: new Date(m.to.start), dueAt: new Date(m.to.end), dueReminderSent: false, overdueNotified: false }, ...(m.task.promisedAt ? { $max: { promisedAt: new Date(m.to.end) } } : {}) }, opts);
  }
  // Payments not reached yet wait for the new version; reached ones stay as they are.
  const swap = {};
  for (const f of plan.fresh) if (!f.check) for (const m of plan.g.chains[plan.g.chainOf[idStr(f.source)]].members) swap[idStr(m)] = f._id;
  const projects = await WorkProject.find({ milestones: { $elemMatch: { doneAt: null, dependsOn: { $in: Object.keys(swap) } } } }, null, opts);
  for (const p of projects) {
    for (const m of p.milestones) if (!m.doneAt) m.dependsOn = [...new Set(m.dependsOn.map((d) => idStr(swap[idStr(d)] || d)))];
    await p.save(opts);
  }
  if (task.project) await WorkProject.updateOne({ _id: task.project, status: "finished" }, { $set: { status: "active", finishedAt: null } }, opts);

  const main = plan.deliveries.find((d) => d.id === idStr(task.project));
  const rootNew = plan.renewed[plan.g.rootChain];
  await ClientChange.updateOne(
    { _id: change._id },
    {
      $set: {
        status: "applied",
        billing,
        decidedBy: user.id,
        decidedAt: now,
        extraHours: plan.extraHours,
        deliveryFrom: main?.from ? new Date(main.from) : null,
        deliveryTo: main?.to ? new Date(main.to) : null,
        items: [
          { task: task._id, number: task.number, status: "approved", action: "revise", hours: plan.fresh[0].hours, newTask: rootNew, newNumber: numbers[rootNew] },
          ...plan.rows.map((r) => ({ task: r.task._id, number: r.task.number, status: r.task.status, action: r.action, hours: r.newTask?.hours || 0, newTask: r.newTask?._id || null, newNumber: r.newTask ? numbers[idStr(r.newTask)] : null })),
        ],
      },
      $unset: { lock: 1 },
    },
    opts
  );
}

// Everyone is told, the plan and the boards follow.
async function afterwards(user, task, plan, change, numbers, billing) {
  const code = changeCode(change.number);
  const rows = plan.rows;
  const created = await Task.find({ _id: { $in: plan.fresh.map((f) => f._id) } });
  for (const t of created) {
    const f = plan.fresh.find((x) => idStr(x) === idStr(t));
    await logActivity(t._id, user, "created", plan.summary, { revisionOf: f.source.number, code });
    if (!f.check) await logActivity(f.source._id, user, "revision_added", plan.summary, { revision: t.revision, code });
    await notify({ type: f.check ? "task.change_check" : "task.revision_added", recipients: [idStr(t.assignee)], actor: user, params: { number: f.source.number, title: taskTitle(await enrichTask(t)), revision: String(t.revision).padStart(2, "0"), note: plan.summary.slice(0, 200), code }, link: `/dashboard/tasks?task=${t._id}`, entityType: "task", entityId: t._id });
    await publishTaskChange(t);
  }
  for (const r of rows) {
    const fresh = await Task.findById(r.task._id);
    if (!fresh) continue;
    await logActivity(fresh._id, user, "client_change", plan.summary, { code, action: r.action });
    if (["wait", "warn", "pause", "hold"].includes(r.action) || (r.action === "revise" && r.task.status === "submitted")) {
      const type = r.action === "revise" ? "task.change_returned" : `task.change_${r.action}`;
      await notify({ type, recipients: [idStr(fresh.assignee)], actor: user, params: { number: fresh.number, root: task.number, title: taskTitle(await enrichTask(fresh)), code }, link: `/dashboard/tasks?task=${fresh._id}`, entityType: "task", entityId: fresh._id });
    }
    await publishTaskChange(fresh);
  }
  for (const m of plan.moves) {
    await logActivity(m.task._id, user, "rescheduled", "", { code });
    await publishTaskChange(m.task);
  }
  if (idStr(change.requestedBy) !== user.id) {
    await notify({ type: "task.change_applied", recipients: [idStr(change.requestedBy)], actor: user, params: { number: task.number, code }, link: `/dashboard/tasks?task=${plan.renewed[plan.g.rootChain]}`, entityType: "task", entityId: task._id });
  }
  if (billing === "paid") await tellFinance(user, change, task, plan.extraHours);
  await audit(user, "task.client_change", { entityType: "task", entityId: task._id, summary: `${code} #${task.number} · ${plan.fresh.length} · ${plan.extraHours}h` });
  for (const person of new Set(rows.filter((r) => r.action === "pause").map((r) => idStr(r.task.assignee)))) await replanPaused(person, plan.cal, user);
  const projects = new Set([idStr(task.project), ...plan.fresh.map((f) => idStr(f.source.project))].filter(Boolean));
  for (const p of projects) await checkStageHandoffs(p, user);
  const root = created.find((t) => idStr(t) === plan.renewed[plan.g.rootChain]);
  await trackDelays({ cause: "client_change", task: root, note: `${code}: ${plan.summary}` }, user);
}

async function tellFinance(user, change, task, hours) {
  const project = task?.project ? await WorkProject.findById(task.project, { name: 1, code: 1 }).lean() : null;
  await notify({
    type: "finance.client_change",
    recipients: await usersWithPermission("invoices.manage"),
    actor: user,
    params: { code: changeCode(change.number), project: project?.name?.en || project?.code || "", hours },
    paramsAr: { project: project?.name?.ar || project?.code || "" },
    link: "/dashboard/finance?tab=invoices",
    entityType: "project",
    entityId: project?._id || "",
  });
}

// The project's record of client changes.
export async function listChanges(user, projectId) {
  const list = await ClientChange.find({ project: projectId, status: { $ne: "applying" } }).sort({ createdAt: -1 }).lean();
  const lang = await viewerLang();
  const ids = list.flatMap((c) => [c.requestedBy, c.decidedBy]).filter(Boolean);
  const [people, cal] = await Promise.all([User.find({ _id: { $in: ids } }, NAME_FIELDS).lean(), getWorkCalendar()]);
  const name = Object.fromEntries(people.map((p) => [idStr(p), pickName(p, lang)]));
  const newTasks = await Task.find({ _id: { $in: list.flatMap((c) => c.items.map((i) => i.newTask)).filter(Boolean) } }, { status: 1 }).lean();
  const statusOf = Object.fromEntries(newTasks.map((t) => [idStr(t), t.status]));
  const billing = canSeeBilling(user);
  return list.map((c) => {
    const from = c.deliveryFrom?.getTime();
    const to = c.deliveryTo?.getTime();
    return {
      id: idStr(c),
      code: changeCode(c.number),
      status: c.status,
      summary: c.summary,
      taskId: idStr(c.task),
      requestedBy: name[idStr(c.requestedBy)] || "",
      decidedBy: name[idStr(c.decidedBy)] || "",
      createdAt: c.createdAt,
      decidedAt: c.decidedAt,
      declineReason: c.declineReason,
      extraHours: c.extraHours,
      deliveryFrom: c.deliveryFrom,
      deliveryTo: c.deliveryTo,
      delayHours: from && to ? Math.round(((to >= from ? workMsBetween(from, to, cal) : -workMsBetween(to, from, cal)) / HOUR) * 10) / 10 : null,
      billing: billing ? c.billing : undefined,
      items: c.items.map((i) => ({ task: idStr(i.task), number: i.number, status: i.status, action: i.action, hours: i.hours, newTask: idStr(i.newTask), newNumber: i.newNumber, newStatus: statusOf[idStr(i.newTask)] || "" })),
    };
  });
}

// Free or paid, decided (or changed) by the CEO. Paid alerts finance; no invoice is made.
export async function setBilling(user, projectId, id, billing) {
  if (!["free", "paid"].includes(billing)) return { error: "invalid_request" };
  const before = await ClientChange.findOneAndUpdate({ _id: id, project: projectId, status: "applied" }, { $set: { billing } });
  if (!before) return { error: "not_found" };
  await audit(user, "task.client_change_billing", { entityType: "task", entityId: before.task, summary: `${changeCode(before.number)} ${billing}` });
  if (billing === "paid" && before.billing !== "paid") await tellFinance(user, before, { project: before.project }, before.extraHours);
  return { ok: true };
}

export const pendingChanges = () => ClientChange.find({ status: "pending" }, { task: 1 }).sort({ createdAt: 1 }).lean();
export async function pendingChangeCode(task) {
  const c = await ClientChange.findOne({ task: task._id, status: "pending" }, { number: 1 }).lean();
  return c ? changeCode(c.number) : null;
}
