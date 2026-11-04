import { hasPermission } from "@/lib/currentUser";
import { freeSlot, getWorkCalendar } from "@/lib/ganttServer";
import { HOUR } from "@/lib/gantt";
import { outsideRoleKeys } from "@/lib/scope";
import { stageAfter } from "@/lib/stageFlow";
import User from "@/models/User";
import Lead from "@/models/Lead";
import { rateOf } from "@/lib/finance";
import { NAME_FIELDS, pickName, viewerLang } from "@/lib/personName";

const idStr = (v) => (v ? v.toString() : null);

// Prices belong to the CEO / GM (the same people who fill the money side of intake forms).
// Everyone else with sales.manage works the leads, the scope and the delivery date.
export const canSeeSalesMoney = (user) => Boolean(user?.isStaff && (hasPermission(user, "intake.finance") || hasPermission(user, "finance.manage")));

/**
 * When the Gantt would deliver this work if it were accepted now: each stage, in its
 * order, goes to whoever in its department has the earliest free time that fits its
 * hours (after the stages it waits for), exactly the way new projects are placed.
 * @param stages      [{ key, hours, department, after, waitForPrevious }]
 * @param department  the work's department (for stages without their own)
 * @returns { start, date, stages: [{ key, person, start, end }] }
 */
export async function previewDelivery(stages, department) {
  const cal = await getWorkCalendar();
  const outside = await outsideRoleKeys();
  const people = {};
  const candidates = async (dep) => {
    const key = idStr(dep) || "none";
    if (!people[key]) {
      const query = { status: "active", role: { $nin: outside }, trainee: { $ne: true } };
      if (dep) query.department = dep;
      people[key] = (await User.find(query, { _id: 1 }).lean()).map((u) => idStr(u._id));
    }
    return people[key];
  };
  const planned = {}; // slots this preview has given each person already
  const ends = {};
  const out = [];
  const now = Date.now();
  for (const [i, stage] of stages.entries()) {
    if (!(stage.hours > 0)) continue;
    const earliest = Math.max(now, ...stageAfter(stages, i).map((k) => ends[k] || 0));
    let best = null;
    for (const person of await candidates(stage.department || department)) {
      const slot = await freeSlot(person, earliest, stage.hours * HOUR, cal, [], planned[person] || []);
      if (!best || slot.end < best.end) best = { ...slot, person };
    }
    if (!best) continue;
    (planned[best.person] ||= []).push({ start: best.start, end: best.end });
    ends[stage.key] = best.end;
    out.push({ key: stage.key, person: best.person, start: new Date(best.start), end: new Date(best.end) });
  }
  if (!out.length) return { start: null, date: null, stages: [] };
  return {
    start: new Date(Math.min(...out.map((s) => s.start.getTime()))),
    date: new Date(Math.max(...out.map((s) => s.end.getTime()))),
    stages: out,
  };
}

// { id: name } for the given user ids, in the viewer's language.
export async function peopleNames(ids) {
  const list = [...new Set(ids.map(idStr).filter(Boolean))];
  const lang = await viewerLang();
  return Object.fromEntries((await User.find({ _id: { $in: list } }, NAME_FIELDS).lean()).map((u) => [idStr(u._id), pickName(u, lang)]));
}

export function serializeLead(l, { money, names = {} }) {
  return {
    id: idStr(l._id),
    name: l.name,
    company: l.company,
    phone: l.phone,
    email: l.email,
    source: l.source,
    stage: l.stage,
    department: idStr(l.department),
    need: l.need,
    ...(money ? { estimatedValue: l.estimatedValue, currency: l.currency } : {}),
    owner: idStr(l.owner),
    ownerName: names[idStr(l.owner)] || null,
    nextAction: l.nextAction || { date: "", note: "" },
    lostReason: l.lostReason,
    client: idStr(l.client),
    notes: (l.notes || []).map((n) => ({ text: n.text, by: names[idStr(n.by)] || "", at: n.at })),
    updatedAt: l.updatedAt,
    createdAt: l.createdAt,
  };
}

export function serializeQuotation(q, { money, names = {} }) {
  return {
    id: idStr(q._id),
    number: q.number,
    lead: idStr(q.lead),
    clientName: q.clientName,
    phone: q.phone,
    projectName: q.projectName,
    department: idStr(q.department),
    template: idStr(q.template),
    stages: (q.stages || []).map((s) => ({ key: s.key, name: s.name, hours: s.hours, department: idStr(s.department), after: s.after, waitForPrevious: s.waitForPrevious })),
    ...(money ? { items: q.items || [], total: q.total, currency: q.currency, rate: q.rate } : {}),
    validUntil: q.validUntil,
    delivery: q.delivery?.date
      ? {
          date: q.delivery.date,
          start: q.delivery.start,
          computedAt: q.delivery.computedAt,
          stages: (q.delivery.stages || []).map((s) => ({ key: s.key, person: idStr(s.person), personName: names[idStr(s.person)] || "", start: s.start, end: s.end })),
        }
      : null,
    status: q.status,
    intake: idStr(q.intake),
    notes: q.notes,
    hours: (q.stages || []).reduce((s, x) => s + (x.hours || 0), 0),
    createdAt: q.createdAt,
  };
}

const isId = (v) => /^[a-f0-9]{24}$/i.test(String(v || ""));
const str = (v, n) => String(v || "").trim().slice(0, n);

// Validated quotation fields. Prices only from someone who may see them (`money`).
export async function cleanQuotation(body, { money, settings, existing = null }) {
  const lead = isId(body.lead) ? await Lead.findById(body.lead).lean() : null;
  const clientName = str(body.clientName || lead?.company || lead?.name, 200);
  const projectName = str(body.projectName, 200);
  if (!clientName || !projectName) return { error: "quote_name_required" };
  const stages = (Array.isArray(body.stages) ? body.stages : [])
    .map((x) => ({
      key: str(x?.key, 60),
      name: { ar: str(x?.name?.ar, 120), en: str(x?.name?.en, 120) },
      hours: Math.min(5000, Math.max(0, Number(x?.hours) || 0)),
      department: isId(x?.department) ? x.department : null,
      after: Array.isArray(x?.after) ? x.after.map((k) => str(k, 60)) : undefined,
      waitForPrevious: Boolean(x?.waitForPrevious),
    }))
    .filter((x) => x.key);
  const value = {
    lead: lead?._id || null,
    clientName,
    phone: str(body.phone || lead?.phone, 40),
    projectName,
    department: isId(body.department) ? body.department : lead?.department || null,
    template: isId(body.template) ? body.template : null,
    stages,
    validUntil: /^\d{4}-\d{2}-\d{2}$/.test(body.validUntil || "") ? body.validUntil : "",
    notes: str(body.notes, 2000),
  };
  if (money) {
    const items = (Array.isArray(body.items) ? body.items : [])
      .map((x) => ({ description: str(x?.description, 300), amount: Number(x?.amount) || 0 }))
      .filter((x) => x.description || x.amount);
    const currency = String(body.currency || settings.currencies.base).toUpperCase();
    const configured = rateOf(settings.currencies, currency);
    if (!configured) return { error: "invalid_currency" };
    Object.assign(value, {
      items,
      total: Math.round(items.reduce((s, x) => s + x.amount, 0) * 100) / 100,
      currency,
      rate: currency === settings.currencies.base ? 1 : Number(body.rate) > 0 ? Number(body.rate) : configured,
    });
  } else if (existing) {
    // Keep the prices someone else set.
    Object.assign(value, { items: existing.items, total: existing.total, currency: existing.currency, rate: existing.rate });
  }
  return { value };
}
