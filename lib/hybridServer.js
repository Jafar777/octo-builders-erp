// "Start work" (the hybrid way of working, lib/hybrid.js): an employee starts project work
// themselves next to what the CEO planned. One piece of work (project · stage · room) is
// one task: if it's already planned, going or handed in, they're led to that task
// instead of a second one being made.
import { addWorkHours, HOUR, isRedo, taskSpan, workDayEnd, gapFrom, heldSpan, HOLDING_STATUSES, workMsBetween, officeDate, taskWorkMs } from "@/lib/gantt";
import { cascadeFrom, clearOverlaps, freeSlot, getWorkCalendar, leaveClash, personCalendar } from "@/lib/ganttServer";
import { AGAIN_REASONS, HYBRID_DEFAULTS, hybridOn, placeKey, placeOutcome, suggestHours } from "@/lib/hybrid";
import { isTopRole } from "@/lib/permissions";
import { isDeptManager } from "@/lib/managerKpi";
import { userDepartments } from "@/lib/scope";
import { replanPaused, trackDelays } from "@/lib/projectDelay";
import { isStageLocked, stageDepartment } from "@/lib/projects";
import { rowLabel, sortRows } from "@/lib/projectRows";
import { notify } from "@/lib/notify";
import { personManagers } from "@/lib/reporting";
import { getSettings } from "@/lib/settings";
import { syncStageDependencies } from "@/lib/taskSchedule";
import { NAME_FIELDS, pickName, viewerLang } from "@/lib/personName";
import { applyTransition, canStartNow, enrichTask, logActivity, managesEmployee, loadWorker, publishTaskChange, taskTitle } from "@/lib/tasks";
import { nextNumber } from "@/models/Counter";
import OvertimeRequest from "@/models/OvertimeRequest";
import StartClaim from "@/models/StartClaim";
import Task from "@/models/Task";
import User from "@/models/User";
import WorkProject from "@/models/WorkProject";
import WorkRequest from "@/models/WorkRequest";

const S = (v) => (v ? String(v) : "");
const WORK = ["task", "revision"];
const clip = (v, n) => String(v || "").trim().slice(0, n);

export async function hybridSettings() {
  const { hybrid } = await getSettings();
  return { ...HYBRID_DEFAULTS, ...hybrid, hours: { ...HYBRID_DEFAULTS.hours, ...(hybrid?.hours || {}) } };
}
export async function selfStartOn(user) {
  return Boolean(user?.isStaff && !user.limited && !isTopRole(user.role) && hybridOn(await hybridSettings(), user.department));
}
// The same for an employee's task (who may not be the one signed in).
export async function hybridPerson(userId, settings = null) {
  const person = await User.findById(userId, { department: 1 }).lean();
  return hybridOn(settings || (await hybridSettings()), person?.department);
}

// What can be started: active projects, their stages, and the rooms / drawings known there.
// Any project's stage (change request CR-6): the stage's manager approves the work first.
export async function startOptions() {
  const projects = await WorkProject.find({ status: "active" }, { name: 1, code: 1, stages: 1, department: 1, rows: 1, items: 1 }).lean();
  const titles = await Task.aggregate([
    { $match: { project: { $in: projects.map((p) => p._id) }, kind: { $in: WORK }, status: { $ne: "cancelled" }, title: { $ne: "" } } },
    { $group: { _id: { p: "$project", s: "$stage", t: "$title" } } },
  ]);
  const by = {};
  for (const { _id } of titles) (by[`${_id.p}|${_id.s}`] ||= []).push(_id.t);
  return projects
    .map((p) => ({
      id: S(p._id),
      name: p.name,
      code: p.code,
      // Spaces / sheets: the work is picked by row (its title is the row's name).
      rows: p.rows || "",
      items: p.rows ? sortRows((p.items || []).filter((i) => !i.archived)).map((i) => ({ id: S(i._id), label: rowLabel(i) })) : [],
      stages: p.stages.map((s) => ({ key: s.key, name: s.name, taskType: s.taskType || "", titles: (by[`${p._id}|${s.key}`] || []).sort((a, b) => a.localeCompare(b)) })),
    }))
    .filter((p) => p.stages.length);
}

// Real hours here for this kind of work (never the old Excel's clock).
async function suggestion(userId, type, settings) {
  const done = await Task.find(
    { type, status: "approved", kind: { $in: WORK }, "legacy.source": { $exists: false }, activeMs: { $gt: HOUR / 4, $lt: 24 * HOUR } },
    { assignee: 1, activeMs: 1 }
  )
    .sort({ submittedAt: -1 })
    .limit(200)
    .lean();
  return suggestHours({ mine: done.filter((t) => S(t.assignee) === userId).map((t) => t.activeMs / HOUR), all: done.map((t) => t.activeMs / HOUR), fallback: settings.hours[type] || settings.hours.other || 3 });
}

const short = async (t) => {
  const e = await enrichTask(t);
  return { id: e.id, number: e.number, title: taskTitle(e), assignee: e.assignee?.name || "", status: e.status, dueAt: e.dueAt, plannedStart: e.plannedStart, revision: e.revision };
};

// Everything about starting this piece of work now, without changing anything.
async function look(user, body) {
  const settings = await hybridSettings();
  if (!(await selfStartOn(user))) return { error: "self_start_off" };
  const project = /^[a-f\d]{24}$/i.test(body.projectId || "") ? await WorkProject.findById(body.projectId).lean() : null;
  if (!project) return { error: "invalid_project" };
  if (project.status !== "active") return { error: "project_not_active" };
  const stage = project.stages.find((s) => s.key === body.stage);
  if (!stage) return { error: "invalid_cell" };
  const { tasks: taskSettings } = await getSettings();
  const type = taskSettings.taskTypes.some((t) => t.key === body.type) ? body.type : stage.taskType || "other";
  // A project with rows: the work is for one row (none = the project as a whole).
  let item = null;
  if (project.rows && body.itemId) {
    item = (project.items || []).find((i) => S(i._id) === String(body.itemId) && !i.archived) || null;
    if (!item) return { error: "invalid_row" };
  }
  const title = item ? rowLabel(item) : clip(body.title, 200);
  const key = placeKey(project._id, stage.key, title);
  const here = (await Task.find({ project: project._id, stage: stage.key, kind: { $in: WORK } }).lean()).filter((t) =>
    project.rows ? S(t.item) === S(item?._id) && (item || placeKey(t.project, t.stage, t.title) === key) : placeKey(t.project, t.stage, t.title) === key
  );
  const found = placeOutcome(here, user.id);
  const suggested = await suggestion(user.id, type, settings);
  // The hours are the employee's estimate (the suggestion if none): the stage's manager
  // sets them when approving (body.decided: the approved hours, carried out as they are).
  const asked = Math.round(Math.min(200, Math.max(0.5, Number(body.hours) || suggested)) * 2) / 2;
  const hours = { hours: asked, pending: null };
  const base = { settings, project, stage, item, type, title, key, here, ...found, suggested, limit: null, hours, urgent: Boolean(body.urgent) };

  const running = await Task.findOne({ assignee: user.id, status: "in_progress", kind: { $ne: "meeting" } });
  base.running = running && S(running._id) !== S(found.task?._id) ? running : null;
  if (!["new", "again", "rejected"].includes(found.outcome)) return base;
  if (found.outcome === "again" && !AGAIN_REASONS.includes(body.again)) return { ...base, needs: "again" };
  if (found.outcome === "again" && body.again === "customer") return { ...base, outcome: "client" };

  // Rejected work waiting comes first, as everywhere else.
  for (const r of await Task.find({ assignee: user.id, status: "todo", kind: "revision", "legacy.source": { $ne: "excel-redo" } }).lean()) {
    if (isRedo(r) && (await canStartNow(r))) return { ...base, outcome: "redo_first", task: r };
  }
  if (!body.stageOk && (await isStageLocked(project, stage.key, null, item?._id || null))) return { ...base, outcome: "stage" };

  const cal = await getWorkCalendar();
  const pc = await personCalendar(user.id, cal);
  const now = Date.now();
  // Not urgent: it waits for the first free time after their planned work, moving nothing.
  if (!base.urgent) {
    const slot = await freeSlot(user.id, now, hours.hours * HOUR, cal);
    base.start = slot.start;
    base.end = slot.end;
    base.fixed = [];
    base.pushes = [];
    return base;
  }
  const end = addWorkHours(now, hours.hours, pc);
  const leave = await leaveClash(user.id, now, end, cal);
  if (leave) return { error: "on_leave", data: { date: leave } };
  base.start = now;
  const planned = await Task.find({ assignee: user.id, status: "todo", kind: { $ne: "meeting" }, plannedStart: { $ne: null }, dueAt: { $gt: new Date(now) }, "legacy.source": { $ne: "excel-redo" } }).sort({ plannedStart: 1 }).lean();
  const hits = planned.filter((t) => taskSpan(t).start < end);
  base.end = end;
  base.fixed = hits.filter((t) => t.fixed);
  base.pushes = hits.filter((t) => !t.fixed);
  if (base.fixed.length && !body.fixedOk && !body.asking) return { ...base, outcome: "fixed" };
  if (base.pushes.length && !clip(body.reason, 500)) return { ...base, needs: "reason" };
  return base;
}

// The screen's answer before anything is started.
export async function checkStart(user, body) {
  const x = await look(user, body);
  if (x.error) return x;
  return {
    outcome: x.outcome,
    needs: x.needs || null,
    task: x.task ? await short(x.task) : null,
    running: x.running ? await short(x.running) : null,
    fixed: await Promise.all((x.fixed || []).map(short)),
    pushes: await Promise.all((x.pushes || []).map(short)),
    suggested: x.suggested,
    limit: x.limit,
    hours: x.hours.hours,
    pending: x.hours.pending,
    start: x.start ? new Date(x.start) : null,
    end: x.end ? new Date(x.end) : null,
    urgent: x.urgent,
    type: x.type,
  };
}

// Held while one piece of work is being started: { ok } or someone else is doing it.
export async function claimed(keys, work) {
  const got = [];
  try {
    for (const key of keys) {
      try {
        await StartClaim.create({ key });
        got.push(key);
      } catch (err) {
        if (err?.code === 11000) return { error: "start_busy", busy: true };
        throw err;
      }
    }
    return await work();
  } finally {
    if (got.length) await StartClaim.deleteMany({ key: { $in: got } });
  }
}

// The task they were on stops its clock, so time is never counted twice.
export async function pauseRunning(assigneeId, exceptId, actor) {
  const running = await Task.findOne({ assignee: assigneeId, status: "in_progress", kind: { $ne: "meeting" }, _id: { $ne: exceptId } });
  if (!running || applyTransition(running, "pause", new Date())) return null;
  await running.save();
  await logActivity(running._id, actor, "pause", "", { switched: true });
  await publishTaskChange(running);
  return running;
}

async function tellManagers(user, type, params, task, link) {
  const managers = await personManagers({ id: user.id, department: user.department });
  const recipients = managers.length ? managers : (await User.find({ role: "ceo", status: "active" }, { _id: 1 }).lean()).map((u) => S(u._id));
  await notify({ type, recipients, actor: user, params, link, entityType: task ? "task" : "workRequest", entityId: task });
}

async function makeTask(user, x, { started, hours, plannedStart, dueAt, body, priority }) {
  const again = x.outcome === "again" ? body.again : "";
  const top = Math.max(-1, ...x.here.filter((t) => t.status !== "cancelled").map((t) => t.revision || 0));
  const prev = x.task || null;
  const isRevision = Boolean(prev) && top >= 0;
  const now = new Date();
  return Task.create({
    number: await nextNumber("task"),
    kind: isRevision ? "revision" : "task",
    title: x.title,
    project: x.project._id,
    item: x.item?._id || null,
    stage: x.stage.key,
    department: stageDepartment(x.project, x.stage),
    type: x.type,
    assignee: user.id,
    createdBy: user.id,
    origin: "self",
    startReason: clip(body.reason, 500),
    revision: isRevision ? top + 1 : 0,
    previousTask: isRevision ? prev._id : null,
    // A redo of rejected work keeps the rejection's cause; doing approved work again isn't a fault.
    revisionCause: x.outcome === "rejected" ? prev.rejectCause || "" : again,
    status: started ? "in_progress" : "todo",
    startedAt: started ? now : null,
    lastResumedAt: started ? now : null,
    plannedStart,
    dueAt,
    estimatedHours: hours,
    maxHours: hours,
    dueManual: true,
    stageOk: Boolean(body.stageOk),
    ...(priority ? { priority } : {}),
    review: prev?.review ? { manager: true, gm: Boolean(prev.review.gm), customer: Boolean(prev.review.customer) } : undefined,
  });
}

export async function startWork(user, body) {
  return claimed([`user:${user.id}`, `place:${placeKey(body.projectId, body.stage, body.itemId ? `#${body.itemId}` : clip(body.title, 200))}`], async () => {
    const x = await look(user, body);
    if (x.error) return x;
    if (x.needs) return { error: x.needs === "again" ? "again_reason_required" : "push_reason_required" };
    if (!["new", "again", "rejected"].includes(x.outcome)) return { error: "start_changed", data: { outcome: x.outcome } };
    const now = new Date();
    const paused = await pauseRunning(user.id, null, user);
    const task = await makeTask(user, x, { started: true, hours: x.hours.hours, plannedStart: now, dueAt: new Date(x.end), body });
    if (task.previousTask && x.outcome === "rejected") await Task.updateMany({ dependsOn: task.previousTask }, { $set: { "dependsOn.$": task._id } });
    await logActivity(task._id, user, "self_started", clip(body.reason, 500), { pushed: x.pushes.map((t) => t.number), paused: paused?.number });
    const cal = await getWorkCalendar();
    // The plan makes room once (the pushed tasks keep their promise dates: lib/hybrid.js).
    const moved = await clearOverlaps(user.id, cal, user);
    await cascadeFrom([task._id, ...moved], cal, user);
    await replanPaused(user.id, cal, user);
    const project = await WorkProject.findById(x.project._id);
    await syncStageDependencies(project, cal, user);
    if (x.pushes.length) {
      task.pushed = x.pushes.map((t) => t.number);
      await task.save();
      const e = await enrichTask(task);
      await tellManagers(user, "task.plan_pushed", { actor: user.name || user.email, number: task.number, title: taskTitle(e), pushed: task.pushed.map((n) => `#${n}`).join(", "), reason: task.startReason }, task._id, "/dashboard/orders?type=work");
    }
    if (x.hours.pending) await openRequest(user, { kind: "hours", task, project: x.project, stage: x.stage.key, title: x.title, type: x.type, hours: x.hours.pending, reason: clip(body.hoursReason, 500) });
    await publishTaskChange(task);
    await trackDelays({ cause: "task_added", task }, user);
    return { task: await enrichTask(task), pausedNumber: paused?.number || null };
  });
}

// ---------- requests ----------

const ceoIds = async () => (await User.find({ role: "ceo", status: "active" }, { _id: 1 }).lean()).map((u) => S(u._id));

// The managers of a department (its heads with a department manager role; a merge's manager).
async function departmentManagers(departmentId) {
  if (!departmentId) return [];
  return personManagers({ id: "", department: S(departmentId) });
}

async function openRequest(user, r) {
  const lock = `${user.id}|${r.kind}|${r.task ? S(r.task._id) : placeKey(r.project?._id, r.stage, r.item ? `#${r.item}` : r.title)}`;
  let request;
  try {
    request = await WorkRequest.create({
      kind: r.kind,
      by: user.id,
      department: user.department || null,
      task: r.task?._id || null,
      project: r.project?._id || null,
      stage: r.stage || "",
      title: r.title || "",
      item: r.item || null,
      type: r.type || "",
      hours: r.hours || 0,
      again: r.again || "",
      reason: r.reason || "",
      stageDepartment: r.stageDepartment || null,
      urgent: Boolean(r.urgent),
      pauseTask: r.pauseTask || null,
      fixedHit: Boolean(r.fixedHit),
      lock,
    });
  } catch (err) {
    if (err?.code === 11000) return { error: "work_request_open" };
    throw err;
  }
  const project = r.project || (r.task?.project ? await WorkProject.findById(r.task.project, { name: 1 }).lean() : null);
  const params = { actor: user.name || user.email, kind: r.kind, title: [project?.name?.ar || project?.name?.en, r.title].filter(Boolean).join(" · "), number: r.task?.number || "", reason: r.reason || "", hours: r.hours || 0, urgent: Boolean(r.urgent) };
  const link = "/dashboard/orders?type=work";
  if (r.kind === "start") {
    // The stage's department manager gives the hours (the CEO alone when it runs into
    // tasks the CEO fixed, or when the department has no manager).
    const managers = r.fixedHit ? [] : (await departmentManagers(r.stageDepartment)).filter((m) => m !== user.id);
    await notify({ type: "task.start_request", recipients: managers.length ? managers : await ceoIds(), actor: user, params, link, entityType: "workRequest", entityId: request._id });
    return { request };
  }
  if (r.kind === "pause") {
    await tellManagers(user, "task.pause_request", params, request._id, link);
    return { request };
  }
  if (r.kind === "fixed") {
    const ceos = (await User.find({ role: "ceo", status: "active" }, { _id: 1 }).lean()).map((u) => S(u._id));
    await notify({ type: "task.work_request", recipients: ceos, actor: user, params, link: "/dashboard/orders?type=work", entityType: "workRequest", entityId: request._id });
  } else await tellManagers(user, "task.work_request", params, request._id, "/dashboard/orders?type=work");
  return { request };
}

// Ask instead of starting: the outcome says what is asked for.
export async function askWork(user, body) {
  const x = await look(user, { ...body, asking: true });
  if (x.error) return x;
  // New work (or work done again): asked for, with the hours the employee expects; the
  // stage's manager sets the hours before it can start (change request CR-6 / CR-9).
  if (["new", "again", "rejected"].includes(x.outcome)) {
    if (x.needs === "again") return { error: "again_reason_required" };
    const reason = clip(body.reason, 500);
    if (x.urgent && !reason) return { error: "reason_required" };
    const res = await openRequest(user, {
      kind: "start",
      task: x.task,
      project: x.project,
      stage: x.stage.key,
      title: x.title,
      item: x.item?._id || null,
      type: x.type,
      hours: x.hours.hours,
      again: x.outcome === "again" ? body.again || "" : "",
      reason,
      stageDepartment: stageDepartment(x.project, x.stage),
      urgent: x.urgent,
      pauseTask: x.urgent && x.running ? x.running._id : null,
      fixedHit: Boolean(x.urgent && x.fixed?.length),
    });
    return res.error ? res : { requested: true };
  }
  const kind = { taken: "transfer", fixed: "fixed", stage: "stage", client: "client" }[x.outcome];
  if (!kind) return { error: "start_changed", data: { outcome: x.outcome } };
  const reason = clip(body.reason, 500);
  if (!reason) return { error: "reason_required" };
  const res = await openRequest(user, { kind, task: x.task, project: x.project, stage: x.stage.key, title: x.title, item: x.item?._id || null, type: x.type, hours: x.hours.hours, again: x.task && kind !== "client" && kind !== "transfer" ? body.again || "" : "", reason });
  return res.error ? res : { requested: true };
}

// Pausing project work needs the employee's manager (or the CEO) first: the task keeps
// running until it's approved (change request CR-9; a pause just to finish easier tasks
// first would otherwise lift their KPI).
export const pauseNeedsApproval = (user, task) => !isTopRole(user?.role) && Boolean(task?.project) && task.kind !== "meeting";

export async function requestPause(user, task, reason) {
  if (task.status !== "in_progress") return { error: "invalid_transition" };
  const why = clip(reason, 500);
  if (!why) return { error: "pause_reason_required" };
  const res = await openRequest(user, { kind: "pause", task, project: task.project ? await WorkProject.findById(task.project, { name: 1 }).lean() : null, stage: task.stage || "", title: task.title || "", type: task.type || "", reason: why });
  if (res.error) return res;
  await logActivity(task._id, user, "pause_requested", why);
  return { requested: true };
}

// How often this employee asked to pause lately (shown to whoever decides).
async function pauseHistory(userId) {
  const since = new Date(Date.now() - 30 * 86400000);
  const [asked, approved] = await Promise.all([
    WorkRequest.countDocuments({ by: userId, $or: [{ kind: "pause" }, { kind: "start", urgent: true }], createdAt: { $gte: since } }),
    WorkRequest.countDocuments({ by: userId, $or: [{ kind: "pause" }, { kind: "start", urgent: true }], status: "approved", createdAt: { $gte: since } }),
  ]);
  return { asked, approved };
}

// "I can help": tells the colleague working on it (they then press Help me).
export async function offerHelp(user, taskId) {
  const task = /^[a-f\d]{24}$/i.test(taskId || "") ? await Task.findById(taskId).lean() : null;
  if (!task || S(task.assignee) === user.id || !["in_progress", "on_hold"].includes(task.status) || !(await selfStartOn(user))) return { error: "start_changed" };
  const e = await enrichTask(task);
  await notify({ type: "task.help_offered", recipients: [S(task.assignee)], actor: user, params: { actor: user.name || user.email, number: task.number, title: taskTitle(e) }, link: `/dashboard/tasks?task=${task._id}`, entityType: "task", entityId: task._id });
  return { offered: true };
}

// The CEO decides everything (and alone what touches fixed tasks); a department manager
// their employees' other requests. Never one's own.
export async function canDecideWork(user, request) {
  if (!user?.isStaff || S(request.by) === user.id || request.status !== "pending") return false;
  if (isTopRole(user.role)) return true;
  if (request.kind === "fixed") return false;
  // New work: the manager of the stage's department (not the employee's own manager),
  // unless it runs into tasks the CEO fixed.
  if (request.kind === "start") {
    if (request.fixedHit || !isDeptManager(user) || user.limited) return false;
    if (userDepartments(user).includes(S(request.stageDepartment))) return true;
    // A department with no manager of its own: the employee's manager, as before.
    return (await departmentManagers(request.stageDepartment)).length === 0 && managesEmployee(user, await loadWorker(request.by));
  }
  return managesEmployee(user, await loadWorker(request.by));
}
export async function workQueue(user) {
  const list = await WorkRequest.find({ status: "pending", by: { $ne: user.id } }).sort({ createdAt: 1 }).limit(300).lean();
  const out = [];
  for (const r of list) if (await canDecideWork(user, r)) out.push(r);
  return out;
}

export async function serializeRequests(list, user) {
  const [people, projects, tasks] = await Promise.all([
    User.find({ _id: { $in: list.flatMap((r) => [r.by, r.decidedBy]).filter(Boolean) } }, NAME_FIELDS).lean(),
    WorkProject.find({ _id: { $in: list.map((r) => r.project).filter(Boolean) } }, { name: 1, stages: 1 }).lean(),
    Task.find({ _id: { $in: list.flatMap((r) => [r.task, r.created, r.pauseTask]).filter(Boolean) } }, { number: 1, assignee: 1, maxHours: 1, title: 1 }).lean(),
  ]);
  const deciding = list.filter((r) => r.status === "pending" && (r.kind === "pause" || r.urgent) && S(r.by) !== user.id);
  const history = Object.fromEntries(await Promise.all([...new Set(deciding.map((r) => S(r.by)))].map(async (id) => [id, await pauseHistory(id)])));
  const lang = await viewerLang();
  const name = Object.fromEntries(people.map((p) => [S(p._id), pickName(p, lang)]));
  const proj = Object.fromEntries(projects.map((p) => [S(p._id), p]));
  const task = Object.fromEntries(tasks.map((t) => [S(t._id), t]));
  return Promise.all(
    list.map(async (r) => ({
      id: S(r._id),
      kind: r.kind,
      by: name[S(r.by)] || "",
      mine: S(r.by) === user.id,
      project: proj[S(r.project)]?.name || null,
      stage: proj[S(r.project)]?.stages.find((s) => s.key === r.stage)?.name || null,
      title: r.title,
      taskId: S(r.task) || null,
      taskNumber: task[S(r.task)]?.number || null,
      hours: r.hours,
      currentHours: task[S(r.task)]?.maxHours || null,
      reason: r.reason,
      status: r.status,
      decidedBy: name[S(r.decidedBy)] || "",
      note: r.note,
      createdId: S(r.created) || null,
      createdNumber: task[S(r.created)]?.number || null,
      createdAt: r.createdAt,
      urgent: Boolean(r.urgent),
      again: r.again || "",
      pauseNumber: task[S(r.pauseTask)]?.number || null,
      pauseTitle: task[S(r.pauseTask)]?.title || "",
      fixedHit: Boolean(r.fixedHit),
      pauses: history[S(r.by)] || null,
      canDecide: await canDecideWork(user, r),
    }))
  );
}

export async function decideWork(user, id, decision, note, hours = null) {
  if (!["approve", "decline"].includes(decision)) return { error: "invalid_request" };
  const request = /^[a-f\d]{24}$/i.test(id || "") ? await WorkRequest.findById(id) : null;
  if (!request || !(await canDecideWork(user, request))) return { error: "forbidden" };
  // New work: the manager gives its hours (what the employee asked for, unless changed).
  let given = request.hours;
  if (request.kind === "start" && decision === "approve" && hours !== null && hours !== undefined && hours !== "") {
    given = Math.round(Number(hours) * 2) / 2;
    if (!(given >= 0.5 && given <= 200)) return { error: "invalid_task_hours" };
  }
  // Taken by this decision: a second click (or another manager) finds it decided.
  const taken = await WorkRequest.findOneAndUpdate(
    { _id: request._id, status: "pending" },
    { $set: { status: decision === "approve" ? "approved" : "declined", decidedBy: user.id, decidedAt: new Date(), note: clip(note, 500), hours: given }, $unset: { lock: 1 } },
    { returnDocument: "after" }
  );
  if (!taken) return { error: "already_decided" };
  if (decision === "approve") {
    const res = await carryOut(user, taken).catch((err) => ({ thrown: err }));
    if (res?.error || res?.thrown) {
      // Not possible any more (or it failed): back to waiting.
      await WorkRequest.updateOne({ _id: taken._id }, { $set: { status: "pending", decidedBy: null, decidedAt: null, hours: request.hours, lock: request.lock } });
      if (res.thrown) throw res.thrown;
      return res;
    }
  }
  await notify({ type: "task.work_decided", recipients: [S(taken.by)], actor: user, params: { kind: taken.kind, approved: decision === "approve", title: taken.title, note: taken.note, hours: taken.kind === "start" ? taken.hours : 0, started: Boolean(taken.urgent) }, link: taken.created ? `/dashboard/tasks?task=${taken.created}` : "/dashboard/orders?type=work", entityType: "workRequest", entityId: taken._id });
  return { ok: true };
}

// Tell the CEO alone that the plan was interrupted, and keep it on the request.
async function planInterrupted(user, r, paused, pushed) {
  if (!paused && !pushed.length) return;
  const interrupted = { paused: paused?.number || null, pushed };
  r.interrupted = interrupted;
  await WorkRequest.updateOne({ _id: r._id }, { $set: { interrupted } });
  const by = await User.findById(r.by, NAME_FIELDS).lean();
  await notify({
    type: "task.plan_interrupted",
    recipients: await ceoIds(),
    actor: user,
    params: { person: by?.name || "", paused: paused ? `#${paused.number}` : "", pushed: pushed.map((n) => `#${n}`).join(", "), reason: r.reason || "", by: user.name || user.email },
    paramsAr: { person: by?.nameAr || by?.name || "" },
    link: "/dashboard/orders?type=work&tab=interrupted",
    entityType: "workRequest",
    entityId: r._id,
  });
}

// Pause the employee's task now (an approved pause): its clock stops, the bar shows it
// paused, and the plan behind it moves.
async function pauseApproved(user, taskId, r) {
  const task = await Task.findById(taskId);
  if (!task || task.status !== "in_progress") return null;
  if (applyTransition(task, "pause", new Date())) return null;
  await task.save();
  await logActivity(task._id, user, "pause", r.reason, { approved: true, request: S(r._id) });
  await publishTaskChange(task);
  return task;
}

// The planned tasks of `assigneeId` that now start later than they did.
async function plannedStarts(assigneeId) {
  const list = await Task.find({ assignee: assigneeId, status: "todo", plannedStart: { $ne: null } }, { number: 1, plannedStart: 1 }).lean();
  return new Map(list.map((t) => [S(t._id), { number: t.number, at: new Date(t.plannedStart).getTime() }]));
}
const later = (before, after) => [...after].filter(([id, t]) => before.has(id) && t.at > before.get(id).at + 60000).map(([, t]) => t.number);

async function carryOut(user, r) {
  const cal = await getWorkCalendar();
  if (r.kind === "client") return {}; // the manager opens the client change on the task
  if (r.kind === "pause") {
    const before = await plannedStarts(r.by);
    const task = await pauseApproved(user, r.task, r);
    if (!task) return { error: "start_changed" };
    await replanPaused(task.assignee, cal, user);
    await trackDelays({ cause: "paused", task }, user);
    await planInterrupted(user, r, task, later(before, await plannedStarts(r.by)));
    return {};
  }
  if (r.kind === "hours") {
    const task = await Task.findById(r.task);
    if (!task || ["cancelled", "approved", "rejected"].includes(task.status)) return { error: "start_changed" };
    const pc = await personCalendar(task.assignee, cal);
    const extra = r.hours - (task.maxHours || 0);
    if (extra > 0) {
      task.dueAt = new Date(addWorkHours(new Date(task.dueAt).getTime(), extra, pc));
      task.promisedAt = task.dueAt;
      task.maxHours = r.hours;
      task.estimatedHours = r.hours;
      task.dueReminderSent = false;
      task.overdueNotified = false;
      await task.save();
      await logActivity(task._id, user, "edited", "", { fields: ["estimatedHours"] });
      await publishTaskChange(task);
      if (HOLDING_STATUSES.includes(task.status)) {
        const moved = await clearOverlaps(task.assignee, cal, user);
        await cascadeFrom([task._id, ...moved], cal, user);
      }
    }
    return {};
  }
  if (r.kind === "transfer") {
    const task = await Task.findById(r.task);
    if (!task || task.status !== "todo" || S(task.assignee) === S(r.by)) return { error: "start_changed" };
    const from = S(task.assignee);
    const pc = await personCalendar(r.by, cal);
    const slot = await freeSlot(r.by, Date.now(), taskWorkMs(task, pc), cal, [task._id]);
    const done = await Task.updateOne(
      { _id: task._id, status: "todo", assignee: task.assignee },
      { $set: { assignee: r.by, fixed: false, plannedStart: new Date(slot.start), dueAt: new Date(slot.end), promisedAt: new Date(slot.end), dueReminderSent: false, overdueNotified: false } }
    );
    if (!done.matchedCount) return { error: "start_changed" };
    const fresh = await Task.findById(task._id);
    const e = await enrichTask(fresh);
    await logActivity(task._id, user, "reassigned", r.reason, { fields: ["assignee"] });
    await notify({ type: "task.reassigned", recipients: [from], actor: user, params: { actor: user.name || user.email, number: task.number, title: taskTitle(e) }, entityType: "task", entityId: task._id });
    await publishTaskChange(fresh, [from]);
    await cascadeFrom([task._id], cal, user);
    await trackDelays({ cause: "reassigned", task: fresh }, user);
    r.created = task._id;
    await WorkRequest.updateOne({ _id: r._id }, { $set: { created: task._id } });
    return {};
  }
  // fixed / stage: the work is made and waits, first in line, for the employee to press Start.
  // start: new work with the hours the manager gave; urgent work comes before the plan
  // (the task they're on pauses), otherwise it waits for their first free time.
  const by = await User.findById(r.by).lean();
  const asker = { id: S(r.by), isStaff: true, limited: false, role: by.role, department: S(by.department), name: by.name, email: by.email };
  const starting = r.kind === "start";
  const urgent = starting && r.urgent;
  return claimed([`user:${asker.id}`, `place:${placeKey(r.project, r.stage, r.item ? `#${r.item}` : r.title)}`], async () => {
    // Tasks the CEO fixed in place are moved only by the CEO's decision.
    const body = { projectId: S(r.project), stage: r.stage, title: r.title, itemId: r.item ? S(r.item) : "", type: r.type, hours: r.hours, again: r.again, reason: r.reason, stageOk: r.kind === "stage", fixedOk: r.kind === "fixed" || (urgent && isTopRole(user.role)), urgent };
    const x = await look(asker, body);
    if (x.error) return x;
    // A stage request may also run into a fixed task: that part stays the CEO's.
    if (x.outcome === "fixed") return { error: "start_changed", data: { outcome: "fixed" } };
    if (x.needs || !["new", "again", "rejected"].includes(x.outcome)) return { error: "start_changed", data: { outcome: x.outcome } };
    const pc = await personCalendar(asker.id, cal);
    const now = Date.now();
    const before = urgent ? await plannedStarts(asker.id) : null;
    // Urgent: the task they're on pauses now (one approval for both).
    // (Whatever they're on by now: the task they asked about, or one started since.)
    const runningNow = urgent ? await Task.findOne({ assignee: asker.id, status: "in_progress", kind: { $ne: "meeting" } }, { _id: 1 }).lean() : null;
    const paused = runningNow ? await pauseApproved(user, runningNow._id, r) : null;
    let slot;
    if (starting && !urgent) slot = await freeSlot(asker.id, now, x.hours.hours * HOUR, cal);
    // Urgent: the switch happens on approval — the new work starts now, where the paused
    // task was (one approval for both; the employee asked for it to come first).
    else if (urgent) slot = { start: now, end: addWorkHours(now, x.hours.hours, pc) };
    else {
      // After what they're on now.
      const busy = (await Task.find({ assignee: asker.id, status: { $in: ["in_progress", "help"] }, kind: { $ne: "meeting" } }).lean()).map(heldSpan);
      slot = gapFrom(now, x.hours.hours * HOUR, busy, pc);
    }
    const task = await makeTask(asker, x, { started: urgent, hours: x.hours.hours, plannedStart: new Date(slot.start), dueAt: new Date(slot.end), body, priority: urgent ? "urgent" : undefined });
    // The fixed tasks it runs into move after it: the CEO said so, and they stay fixed there.
    for (const f of x.fixed) {
      const t = await Task.findById(f._id);
      if (!t || t.status !== "todo") continue;
      const length = workMsBetween(taskSpan(t).start, taskSpan(t).end, pc) || HOUR;
      const others = (await Task.find({ assignee: asker.id, status: { $in: HOLDING_STATUSES }, plannedStart: { $ne: null }, dueAt: { $ne: null }, _id: { $ne: t._id }, $or: [{ status: { $ne: "todo" } }, { fixed: true }, { _id: task._id }] }).lean()).map(heldSpan);
      const to = gapFrom(Math.max(slot.end, taskSpan(t).start), length, others, pc);
      Object.assign(t, { plannedStart: new Date(to.start), dueAt: new Date(to.end), promisedAt: new Date(to.end), dueReminderSent: false, overdueNotified: false });
      await t.save();
      await logActivity(t._id, user, "rescheduled", "", { by: S(task._id) });
      await publishTaskChange(t);
      await cascadeFrom([t._id], cal, user);
    }
    const moved = await clearOverlaps(asker.id, cal, user);
    await cascadeFrom([task._id, ...moved], cal, user);
    if (task.previousTask && x.outcome === "rejected") await Task.updateMany({ dependsOn: task.previousTask }, { $set: { "dependsOn.$": task._id } });
    await logActivity(task._id, user, "created", r.reason, { request: r.kind, hours: x.hours.hours });
    if (urgent) await logActivity(task._id, user, "start", "", { approved: true });
    if (paused) await replanPaused(asker.id, cal, user);
    const project = await WorkProject.findById(r.project);
    await syncStageDependencies(project, cal, user);
    await publishTaskChange(task);
    await trackDelays({ cause: "task_added", task }, user);
    r.created = task._id;
    await WorkRequest.updateOne({ _id: r._id }, { $set: { created: task._id } });
    if (urgent) await planInterrupted(user, r, paused, later(before, await plannedStarts(asker.id)));
    return {};
  });
}

// The CEO's list: approved pauses and urgent work that interrupted the plan (the CEO only).
export async function planInterruptions(user, days = 60) {
  if (!isTopRole(user?.role) || user.role === "gm") return null;
  const list = await WorkRequest.find({
    status: "approved",
    $or: [{ "interrupted.paused": { $ne: null } }, { "interrupted.pushed.0": { $exists: true } }],
    decidedAt: { $gte: new Date(Date.now() - days * 86400000) },
  })
    .sort({ decidedAt: -1 })
    .limit(300)
    .lean();
  const rows = await serializeRequests(list, user);
  return rows.map((row, i) => ({ ...row, decidedAt: list[i].decidedAt, interrupted: list[i].interrupted }));
}

// What a manager (their people) or the CEO (everyone) sees: work started without a plan
// in the last days, and this month's planned and self-started work per person.
export async function startedByThemselves(user, days = 7) {
  const people = await User.find({ status: "active", role: { $nin: ["user", "coder", "ceo", "gm"] } }, { ...NAME_FIELDS, department: 1, managedDepartments: 1, access: 1, role: 1 }).lean();
  const { withWorkDepartments } = await import("@/lib/roles");
  const mine = isTopRole(user.role) ? people : (await withWorkDepartments(people)).filter((p) => managesEmployee(user, p));
  const ids = mine.map((p) => p._id);
  const lang = await viewerLang();
  const names = Object.fromEntries(mine.map((p) => [S(p._id), pickName(p, lang)]));
  const recent = await Task.find({ assignee: { $in: ids }, origin: "self", createdAt: { $gte: new Date(Date.now() - days * 86400000) } }).sort({ createdAt: -1 }).limit(100).lean();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const month = await Task.find({ assignee: { $in: ids }, kind: { $in: WORK }, "legacy.source": { $exists: false }, status: { $ne: "cancelled" }, startedAt: { $gte: monthStart } }, { assignee: 1, origin: 1, maxHours: 1, estimatedHours: 1, pushed: 1 }).lean();
  const rows = {};
  for (const t of month) {
    const r = (rows[S(t.assignee)] ||= { name: names[S(t.assignee)], planned: 0, plannedHours: 0, self: 0, selfHours: 0, pushed: 0 });
    const h = t.maxHours || t.estimatedHours || 0;
    if (t.origin === "self") {
      r.self += 1;
      r.selfHours += h;
      r.pushed += t.pushed?.length || 0;
    } else {
      r.planned += 1;
      r.plannedHours += h;
    }
  }
  return {
    recent: await Promise.all(recent.map(async (t) => ({ ...(await short(t)), reason: t.startReason || "", pushed: t.pushed || [], hours: t.maxHours, at: t.createdAt }))),
    month: Object.values(rows).sort((a, b) => b.self + b.planned - (a.self + a.planned)),
  };
}

// ---------- the end of the working day ----------

// Running tasks nobody stopped: their clock ends with the working day (later on a day
// with an overtime request; work resumed after hours counts four hours at most).
export async function pauseAfterHours(now = Date.now()) {
  const settings = await hybridSettings();
  if (!settings.endOfDay || !Object.keys(settings.departments).length) return 0;
  const running = await Task.find({ status: "in_progress", kind: { $ne: "meeting" }, lastResumedAt: { $ne: null } });
  const cal = await getWorkCalendar();
  let n = 0;
  for (const task of running) {
    if (!(await hybridPerson(task.assignee, settings))) continue;
    const pc = await personCalendar(task.assignee, cal);
    const since = task.lastResumedAt.getTime();
    let end = workDayEnd(since, pc);
    const extra = await OvertimeRequest.findOne({ user: task.assignee, date: officeDate(since, pc), status: { $in: ["pending", "approved"] } }, { hours: 1 }).lean();
    if (end && extra?.hours) end += extra.hours * HOUR;
    const stop = end && since < end ? end : since + 4 * HOUR;
    // Half an hour to finish up before it's called forgotten.
    if (now < stop + HOUR / 2) continue;
    if (applyTransition(task, "pause", new Date(stop))) continue;
    task.autoPausedAt = new Date(stop);
    await task.save();
    await logActivity(task._id, null, "auto_paused");
    await publishTaskChange(task);
    const e = await enrichTask(task);
    await notify({ type: "task.auto_paused", recipients: [S(task.assignee)], params: { number: task.number, title: taskTitle(e) }, link: `/dashboard/tasks?task=${task._id}`, entityType: "task", entityId: task._id });
    n += 1;
  }
  return n;
}
