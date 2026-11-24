// The executive office, server side (lib/office.js has the pure rules): who may use it,
// who answers an item, what the board shows, the quick capture, and the month's numbers
// for the office KPI (lib/kpi/office.js).
import mongoose from "mongoose";
import { hasPermission } from "@/lib/currentUser";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { headsOf, userDepartments } from "@/lib/scope";
import { isDeptManager, managerRoleKeys, ratingPercent } from "@/lib/managerKpi";
import { NAME_FIELDS, pickName, viewerLang } from "@/lib/personName";
import { isTopRole } from "@/lib/permissions";
import { fromLocal, localParts } from "@/lib/attendance";
import { CLOSED_STATUSES, OPEN_STATUSES, correspondenceCode, dueFromChip, itemCode, waitingHours } from "@/lib/office";
import { OFFICE_RATING_CRITERIA, officeValues } from "@/lib/kpi/office";
import { nextNumber } from "@/models/Counter";
import Client from "@/models/Client";
import Correspondence from "@/models/Correspondence";
import Department from "@/models/Department";
import Interaction from "@/models/Interaction";
import Lead from "@/models/Lead";
import ManagerRating from "@/models/ManagerRating";
import Meeting from "@/models/Meeting";
import OfficeItem from "@/models/OfficeItem";
import ProjectIntake from "@/models/ProjectIntake";
import Role from "@/models/Role";
import User from "@/models/User";
import WorkProject from "@/models/WorkProject";
import { Candidate } from "@/models/Recruitment";

const idStr = (v) => (v ? String(v._id || v) : null);
const oid = (v) => new mongoose.Types.ObjectId(String(v));
export const OFFICE_LINK = "/dashboard/office";

// The office itself: the secretary (office.manage) and the CEO.
export const canUseOffice = (user) => Boolean(user?.isStaff && !user.limited && hasPermission(user, "office.manage"));

// The people who answer an item: its person, or its department's managers.
export async function itemReceivers(item) {
  if (item.assignee) return [idStr(item.assignee)];
  if (!item.department) return [];
  const roles = await managerRoleKeys();
  const heads = await User.find({ status: "active", role: { $in: roles }, ...(await headsOf(item.department)) }, { _id: 1 }).lean();
  return heads.map((h) => idStr(h._id));
}

// Is `user` on the answering side of `item` (its person, a manager of its department, or
// the CEO)?
export function answersItem(user, item) {
  if (!user?.isStaff) return false;
  if (idStr(item.assignee) === user.id) return true;
  if (item.department && isDeptManager(user) && userDepartments(user).includes(idStr(item.department))) return true;
  return isTopRole(user.role);
}

// May `user` see the item? The office, the answering side, and an employee their own request.
export const seesItem = (user, item) => canUseOffice(user) || answersItem(user, item) || idStr(item.requester) === user?.id;

// Names for a list of items / meetings / letters: people, departments, clients, projects.
export async function lookupNames(docs) {
  const lang = await viewerLang();
  const ids = (keys) => [...new Set(docs.flatMap((d) => keys.flatMap((k) => [].concat(d[k] || []))).map(idStr).filter(Boolean))];
  const [people, deps, clients, projects] = await Promise.all([
    User.find({ _id: { $in: ids(["assignee", "requester", "createdBy", "closedBy", "organizer", "participants", "by", "person", "owner"]).concat(docs.flatMap((d) => (d.updates || []).map((u) => idStr(u.by))).filter(Boolean)) } }, { ...NAME_FIELDS, avatarUrl: 1 }).lean(),
    Department.find({ _id: { $in: ids(["department"]) } }, { name: 1, color: 1 }).lean(),
    Client.find({ _id: { $in: ids(["client"]) } }, { name: 1 }).lean(),
    WorkProject.find({ _id: { $in: ids(["project"]) } }, { name: 1, code: 1 }).lean(),
  ]);
  return {
    person: Object.fromEntries(people.map((p) => [idStr(p._id), { id: idStr(p._id), name: pickName(p, lang), avatarUrl: p.avatarUrl || "" }])),
    department: Object.fromEntries(deps.map((d) => [idStr(d._id), { id: idStr(d._id), name: d.name?.[lang] || d.name?.en || "", color: d.color || "" }])),
    client: Object.fromEntries(clients.map((c) => [idStr(c._id), { id: idStr(c._id), name: c.name }])),
    project: Object.fromEntries(projects.map((p) => [idStr(p._id), { id: idStr(p._id), name: p.name?.[lang] || p.name?.en || "", code: p.code || "" }])),
  };
}

export function serializeItem(i, names, viewer = null) {
  return {
    id: idStr(i._id),
    code: itemCode(i.number),
    number: i.number,
    kind: i.kind,
    title: i.title,
    details: i.details || "",
    priority: i.priority,
    status: i.status,
    due: i.due || null,
    client: names.client[idStr(i.client)] || null,
    project: names.project[idStr(i.project)] || null,
    lead: idStr(i.lead),
    meeting: idStr(i.meeting),
    correspondence: idStr(i.correspondence),
    assignee: names.person[idStr(i.assignee)] || null,
    department: names.department[idStr(i.department)] || null,
    requester: names.person[idStr(i.requester)] || null,
    adminType: i.adminType || "",
    task: idStr(i.task),
    updates: (i.updates || []).map((u) => ({ id: idStr(u._id), kind: u.kind, text: u.text || "", status: u.status || "", by: names.person[idStr(u.by)] || null, at: u.at })),
    sentAt: i.sentAt || null,
    firstResponseAt: i.firstResponseAt || null,
    closedAt: i.closedAt || null,
    waitingHours: waitingHours(i),
    createdBy: names.person[idStr(i.createdBy)] || null,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
    // What the viewer may do with it.
    can: viewer ? { office: canUseOffice(viewer), answer: answersItem(viewer, i), convert: Boolean(i.department || i.assignee) && isDeptManager(viewer) && answersItem(viewer, i) && !i.task } : undefined,
  };
}

export async function serializeItems(list, viewer = null) {
  const names = await lookupNames(list);
  return list.map((i) => serializeItem(i, names, viewer));
}

// A new item (the office, or an employee's admin request). Sends it on when it has a
// person / department. Returns the saved doc.
export async function createItem(user, data) {
  const item = new OfficeItem({ ...data, number: await nextNumber("office"), createdBy: user.id, updates: [] });
  if (item.assignee || item.department) {
    item.status = "sent";
    item.sentAt = new Date();
  }
  await item.save();
  await audit(user, "office.item_created", { entityType: "office", entityId: item._id, summary: `${itemCode(item.number)} ${item.title}` });
  if (item.status === "sent") await tellReceivers(item, user);
  return item;
}

export async function tellReceivers(item, actor, type = "office.request_sent") {
  const recipients = (await itemReceivers(item)).filter((id) => id !== idStr(actor?.id || actor));
  if (!recipients.length) return;
  await notify({
    type,
    recipients,
    actor,
    params: { code: itemCode(item.number), title: item.title, actor: actor?.name || actor?.email || "" },
    link: `${OFFICE_LINK}/inbox`,
    entityType: "office",
    entityId: item._id,
  });
}

// The people who run the office (to tell them of answers and admin requests).
export async function officeStaffIds() {
  const roles = await Role.find({ permissions: "office.manage", key: { $nin: ["ceo", "coder"] } }, { key: 1 }).lean();
  return (await User.find({ status: "active", role: { $in: roles.map((r) => r.key) } }, { _id: 1 }).lean()).map((u) => idStr(u._id));
}

// ---------- the daily board ----------

// The office's day (GET /api/office/today): what's due, overdue, waiting on departments,
// calls to return, meetings, new inquiries, interviews, and what was closed today.
export async function todayBoard(user, tz) {
  const now = new Date();
  const today = localParts(now, tz).date;
  // The office day, in its time zone.
  const startOfDay = fromLocal(today, "00:00", tz);
  const endOfDay = new Date(startOfDay.getTime() + 86400000);
  const in7 = new Date(startOfDay.getTime() + 7 * 86400000);

  const open = { status: { $in: OPEN_STATUSES } };
  const [dueToday, overdue, waiting, callbacks, meetings, inquiries, closedToday, adminRequests, complaints] = await Promise.all([
    OfficeItem.find({ ...open, due: { $gte: startOfDay, $lt: endOfDay } }).sort({ due: 1 }).limit(50).lean(),
    OfficeItem.find({ ...open, due: { $lt: startOfDay } }).sort({ due: 1 }).limit(50).lean(),
    OfficeItem.find({ status: { $in: ["sent", "acknowledged"] }, sentAt: { $ne: null } }).sort({ sentAt: 1 }).limit(50).lean(),
    Interaction.find({ callback: true, callbackDoneAt: null }).sort({ at: 1 }).limit(30).lean(),
    Meeting.find({ status: "scheduled", start: { $gte: startOfDay, $lt: in7 } }).sort({ start: 1 }).limit(20).lean(),
    Lead.find({ stage: "new" }).sort({ createdAt: -1 }).limit(20).lean(),
    OfficeItem.find({ status: { $in: CLOSED_STATUSES }, closedAt: { $gte: startOfDay } }).sort({ closedAt: -1 }).limit(30).lean(),
    OfficeItem.find({ kind: "admin_request", ...open }).sort({ createdAt: 1 }).limit(30).lean(),
    OfficeItem.find({ kind: "complaint", ...open }).sort({ createdAt: 1 }).limit(30).lean(),
  ]);
  // Interviews today (recruitment), when the person may see hiring.
  let interviews = [];
  if (hasPermission(user, "recruitment.manage") || hasPermission(user, "recruitment.assist")) {
    const list = await Candidate.find({ "interviews.date": today }, { name: 1, phone: 1, stage: 1 }).lean();
    interviews = list.map((c) => ({ id: idStr(c._id), name: c.name, phone: c.phone || "", stage: c.stage }));
  }

  const items = [...dueToday, ...overdue, ...waiting, ...closedToday, ...adminRequests, ...complaints];
  const names = await lookupNames([...items, ...callbacks, ...meetings]);
  const s = (list) => list.map((i) => serializeItem(i, names, user));
  return {
    today,
    dueToday: s(dueToday),
    overdue: s(overdue),
    waiting: s(waiting),
    adminRequests: s(adminRequests),
    complaints: s(complaints),
    closedToday: s(closedToday),
    callbacks: callbacks.map((x) => serializeInteraction(x, names)),
    meetings: meetings.map((m) => serializeMeeting(m, names)),
    inquiries: inquiries.map((l) => ({ id: idStr(l._id), name: l.name, company: l.company || "", phone: l.phone || "", need: l.need || "", source: l.source, createdAt: l.createdAt })),
    interviews,
  };
}

export function serializeInteraction(x, names) {
  return {
    id: idStr(x._id),
    channel: x.channel,
    summary: x.summary,
    outcome: x.outcome || "",
    client: names.client[idStr(x.client)] || null,
    project: names.project[idStr(x.project)] || null,
    person: names.person[idStr(x.person)] || null,
    lead: idStr(x.lead),
    contactName: x.contactName || "",
    contactPhone: x.contactPhone || "",
    callback: Boolean(x.callback),
    callbackDoneAt: x.callbackDoneAt || null,
    item: idStr(x.item),
    at: x.at,
    by: names.person[idStr(x.by)] || null,
  };
}

export function serializeMeeting(m, names) {
  return {
    id: idStr(m._id),
    kind: m.kind,
    title: m.title,
    start: m.start,
    end: m.end,
    place: m.place || "",
    participants: (m.participants || []).map((p) => names.person[idStr(p)]).filter(Boolean),
    guests: m.guests || "",
    client: names.client[idStr(m.client)] || null,
    project: names.project[idStr(m.project)] || null,
    agenda: m.agenda || "",
    minutes: m.minutes || "",
    minutesAt: m.minutesAt || null,
    decisions: (m.decisions || []).map((d) => ({ id: idStr(d._id), text: d.text, owner: names.person[idStr(d.owner)] || null, due: d.due || null, item: idStr(d.item) })),
    status: m.status,
    organizer: names.person[idStr(m.organizer)] || null,
  };
}

export function serializeCorrespondence(c, names) {
  return {
    id: idStr(c._id),
    direction: c.direction,
    ref: c.ref,
    subject: c.subject,
    counterparty: c.counterparty || "",
    channel: c.channel,
    date: c.date,
    notes: c.notes || "",
    attachments: c.attachments || [],
    links: c.links || [],
    client: names.client[idStr(c.client)] || null,
    project: names.project[idStr(c.project)] || null,
    deliveredTo: c.deliveredTo || "",
    receivedAt: c.receivedAt || null,
    createdBy: names.person[idStr(c.createdBy)] || null,
    createdAt: c.createdAt,
  };
}

// A new correspondence entry with its register number (IN- / OUT-year-n).
export async function createCorrespondence(user, data) {
  const year = String(data.date || new Date().toISOString()).slice(0, 4);
  const n = await nextNumber(`corr-${data.direction}-${year}`);
  const doc = await Correspondence.create({ ...data, ref: correspondenceCode(data.direction, year, n), createdBy: user.id });
  await audit(user, "office.correspondence", { entityType: "correspondence", entityId: doc._id, summary: `${doc.ref} ${doc.subject}` });
  return doc;
}

// The day a quick-capture date chip means, in the office's time zone.
export const dueFor = (chip, tz) => dueFromChip(chip, localParts(new Date(), tz).date);

// ---------- the office KPI's month ----------

// { [userId]: officeValues } for the people scored as the office this month (roles with
// kpiProfile "office"). `summaries`: attendance summaries (present days).
export async function officeKpiInputs(month, staff, summaries, tz) {
  const officeRoles = (await Role.find({ kpiProfile: "office" }, { key: 1 }).lean()).map((r) => r.key);
  const people = staff.filter((s) => officeRoles.includes(s.role));
  if (!people.length) return {};
  const [y, m] = month.split("-").map(Number);
  const from = Date.UTC(y, m - 1, 1) - 86400000;
  const to = Date.UTC(y, m, 1) + 86400000;
  const range = { from: Date.UTC(y, m - 1, 1), to: Date.UTC(y, m, 1) };
  const ids = people.map((p) => oid(p.id));
  const span = { $gte: new Date(from), $lt: new Date(to) };
  const [items, interactions, leads, meetings, correspondence, intakes, ratings] = await Promise.all([
    OfficeItem.find({ createdBy: { $in: ids }, $or: [{ due: span }, { createdAt: span }, { updatedAt: span }, { status: { $in: OPEN_STATUSES } }] }).lean(),
    Interaction.find({ by: { $in: ids }, at: span }).lean(),
    Lead.find({ createdBy: { $in: ids }, createdAt: span }).lean(),
    Meeting.find({ organizer: { $in: ids }, end: span }).lean(),
    Correspondence.find({ createdBy: { $in: ids }, createdAt: span }).lean(),
    ProjectIntake.find({ createdBy: { $in: ids }, createdAt: span }).lean(),
    ManagerRating.find({ month, user: { $in: ids } }).lean(),
  ]);
  const out = {};
  for (const p of people) {
    const mine = (v) => idStr(v) === p.id;
    // The office days they logged something on.
    const days = new Set();
    const mark = (d) => d && localParts(new Date(d), tz).date.startsWith(month) && days.add(localParts(new Date(d), tz).date);
    for (const i of items) {
      if (mine(i.createdBy)) mark(i.createdAt);
      for (const u of i.updates || []) if (mine(u.by)) mark(u.at);
    }
    for (const x of interactions) if (mine(x.by)) mark(x.at);
    for (const x of meetings) if (mine(x.organizer)) mark(x.createdAt);
    for (const x of correspondence) if (mine(x.createdBy)) mark(x.createdAt);
    for (const x of leads) if (mine(x.createdBy)) mark(x.createdAt);
    for (const x of intakes) if (mine(x.createdBy)) mark(x.createdAt);
    const rating = ratings.find((r) => mine(r.user));
    out[p.id] = officeValues(p.id, range, {
      items,
      interactions,
      leads,
      meetings,
      correspondence,
      intakes,
      activeDays: days,
      presentDays: summaries[p.id]?.presentDays || 0,
      rating: rating ? ratingPercent(rating, OFFICE_RATING_CRITERIA) : null,
    });
  }
  return out;
}

// Closes the office items a finished task was made from (a department manager turned the
// request into that task).
export async function closeItemsForTask(task, actor = null) {
  const items = await OfficeItem.find({ task: task._id, status: { $in: OPEN_STATUSES } });
  for (const item of items) {
    item.status = "done";
    item.closedAt = new Date();
    item.closedBy = idStr(actor?.id || actor) || null;
    item.updates.push({ kind: "status", status: "done", text: `#${task.number}`, by: item.closedBy, at: new Date() });
    await item.save();
    await notify({
      type: "office.item_done",
      recipients: [idStr(item.createdBy)],
      actor,
      params: { code: itemCode(item.number), title: item.title },
      link: OFFICE_LINK,
      entityType: "office",
      entityId: item._id,
    });
  }
}

export const clientRef = (id) => (mongoose.isValidObjectId(id) ? id : null);

// ---------- clients ----------
const cut = (v, n) => String(v || "").trim().slice(0, n);
export function cleanClient(b = {}) {
  return {
    name: cut(b.name, 160),
    kind: b.kind === "company" ? "company" : "person",
    phone: cut(b.phone, 40),
    whatsapp: cut(b.whatsapp, 40),
    email: cut(b.email, 160),
    city: cut(b.city, 80),
    source: cut(b.source, 30),
    notes: cut(b.notes, 2000),
    tags: (Array.isArray(b.tags) ? b.tags : []).map((t) => cut(t, 30)).filter(Boolean).slice(0, 10),
    contacts: (Array.isArray(b.contacts) ? b.contacts : []).slice(0, 20).map((c) => ({ name: cut(c?.name, 120), role: cut(c?.role, 80), phone: cut(c?.phone, 40), whatsapp: cut(c?.whatsapp, 40), email: cut(c?.email, 160) })).filter((c) => c.name),
  };
}
export const serializeClient = (c) => ({
  id: idStr(c._id),
  name: c.name,
  kind: c.kind || "person",
  phone: c.phone || "",
  whatsapp: c.whatsapp || "",
  email: c.email || "",
  city: c.city || "",
  source: c.source || "",
  notes: c.notes || "",
  tags: c.tags || [],
  contacts: (c.contacts || []).map((x) => ({ id: idStr(x._id), name: x.name, role: x.role || "", phone: x.phone || "", whatsapp: x.whatsapp || "", email: x.email || "" })),
  createdAt: c.createdAt,
});

// ---------- correspondence files ----------
// Files uploaded for the register (the private office folder) and links (Drive…).
export const cleanAttachments = (list) =>
  (Array.isArray(list) ? list : [])
    .slice(0, 20)
    .map((a) => ({ name: cut(a?.name, 200), url: cut(a?.url, 1000), size: Math.max(0, Number(a?.size) || 0), mime: cut(a?.mime, 100) }))
    .filter((a) => /^(\/uploads\/|https:\/\/)/.test(a.url));
export const cleanLinks = (list) =>
  [...new Set((Array.isArray(list) ? list : [list]).map((l) => cut(l, 1000)).filter((l) => /^https?:\/\//.test(l)))].slice(0, 20);

// ---------- the overview (app/api/home) ----------

// Open items waiting on `user`: sent to them, or (a department manager) to their departments.
export function inboxQuery(user) {
  const targets = [{ assignee: oid(user.id) }];
  if (isDeptManager(user)) targets.push({ department: { $in: userDepartments(user).map(oid) }, assignee: null });
  return { kind: { $ne: "admin_request" }, status: { $in: ["sent", "acknowledged"] }, sentAt: { $ne: null }, $or: targets };
}

// The office's day in numbers (the secretary's headline tiles).
export async function officeDayCounts(tz) {
  const today = localParts(new Date(), tz).date;
  const start = fromLocal(today, "00:00", tz);
  const end = new Date(start.getTime() + 86400000);
  const open = { status: { $in: OPEN_STATUSES } };
  const [dueToday, overdue, waiting, callbacks, meetingsToday] = await Promise.all([
    OfficeItem.countDocuments({ ...open, due: { $gte: start, $lt: end } }),
    OfficeItem.countDocuments({ ...open, due: { $lt: start } }),
    OfficeItem.countDocuments({ status: { $in: ["sent", "acknowledged"] }, sentAt: { $ne: null } }),
    Interaction.countDocuments({ callback: true, callbackDoneAt: null }),
    Meeting.countDocuments({ status: "scheduled", start: { $gte: start, $lt: end } }),
  ]);
  return { dueToday, overdue, waiting, callbacks, meetingsToday };
}

// The CEO's "Office pulse": open complaints, requests late at the departments, which
// departments answer slowest (last 30 days), today's meetings, this week's inquiries and
// how many became intake forms.
export async function officePulse(tz) {
  const now = new Date();
  const today = localParts(now, tz).date;
  const start = fromLocal(today, "00:00", tz);
  const month = new Date(now.getTime() - 30 * 86400000);
  const week = new Date(now.getTime() - 7 * 86400000);
  const [complaints, lateAtDepartments, answered, meetingsToday, inquiriesWeek, intakesWeek, closedToday] = await Promise.all([
    OfficeItem.countDocuments({ kind: "complaint", status: { $in: OPEN_STATUSES } }),
    OfficeItem.countDocuments({ status: { $in: ["sent", "acknowledged"] }, department: { $ne: null }, due: { $lt: now } }),
    OfficeItem.find({ department: { $ne: null }, sentAt: { $gte: month } }, { department: 1, sentAt: 1, firstResponseAt: 1 }).lean(),
    Meeting.countDocuments({ status: "scheduled", start: { $gte: start, $lt: new Date(start.getTime() + 86400000) } }),
    Lead.countDocuments({ createdAt: { $gte: week } }),
    ProjectIntake.countDocuments({ createdAt: { $gte: week } }),
    OfficeItem.countDocuments({ status: { $in: CLOSED_STATUSES }, closedAt: { $gte: start } }),
  ]);
  // Average hours to a first answer, per department (unanswered ones count until now).
  const byDep = {};
  for (const i of answered) {
    const k = idStr(i.department);
    const hours = ((i.firstResponseAt ? new Date(i.firstResponseAt) : now) - new Date(i.sentAt)) / 3600000;
    (byDep[k] ||= []).push(hours);
  }
  const names = await lookupNames(Object.keys(byDep).map((department) => ({ department })));
  const departments = Object.entries(byDep)
    .map(([id, hs]) => ({ id, name: names.department[id]?.name || "", color: names.department[id]?.color || "", requests: hs.length, avgHours: Math.round((hs.reduce((a, b) => a + b, 0) / hs.length) * 10) / 10 }))
    .sort((a, b) => b.avgHours - a.avgHours)
    .slice(0, 5);
  return { complaints, lateAtDepartments, meetingsToday, inquiriesWeek, intakesWeek, closedToday, departments };
}

// ---------- the daily job (lib/dailyJobs.js) ----------

// Once a day: the office hears its day (due today, overdue, waiting on departments);
// each person / department manager with office requests past their date is reminded;
// the CEO gets the office's summary.
export async function officeDailyJob(tz) {
  const counts = await officeDayCounts(tz);
  const office = await officeStaffIds();
  if (office.length && (counts.dueToday || counts.overdue || counts.waiting)) {
    await notify({ type: "office.daily_summary", recipients: office, params: { due: counts.dueToday, overdue: counts.overdue, waiting: counts.waiting }, link: OFFICE_LINK, entityType: "office" });
  }
  // Late at the answering side: one reminder per person with how many.
  const late = await OfficeItem.find({ status: { $in: ["sent", "acknowledged"] }, due: { $lt: new Date() } }, { assignee: 1, department: 1 }).lean();
  const perPerson = {};
  for (const item of late) for (const id of await itemReceivers(item)) perPerson[id] = (perPerson[id] || 0) + 1;
  for (const [id, n] of Object.entries(perPerson)) {
    await notify({ type: "office.overdue_requests", recipients: [id], params: { n }, link: `${OFFICE_LINK}/inbox`, entityType: "office" });
  }
  // The CEO's digest.
  const ceo = (await User.find({ status: "active", role: "ceo" }, { _id: 1 }).lean()).map((u) => idStr(u._id));
  const pulse = await officePulse(tz);
  if (ceo.length && (pulse.closedToday || counts.waiting || pulse.complaints)) {
    await notify({ type: "office.ceo_digest", recipients: ceo, params: { closed: pulse.closedToday, waiting: counts.waiting, complaints: pulse.complaints }, link: OFFICE_LINK, entityType: "office" });
  }
  return { summary: office.length, reminded: Object.keys(perPerson).length, ceo: ceo.length };
}
