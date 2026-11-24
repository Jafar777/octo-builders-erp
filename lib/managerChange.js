// When someone's manager changes (the CEO moves them in the chart, a merge starts or
// ends, a department or role changes), what's still waiting for "their manager" follows
// to the new one (lib/reporting.js): leave at the manager step, pending overtime, and
// performance reviews the manager hasn't written yet.
import Appraisal, { AppraisalCycle } from "@/models/Appraisal";
import LeaveRequest from "@/models/LeaveRequest";
import OvertimeRequest from "@/models/OvertimeRequest";
import { holding, loadLinks, personManagers } from "@/lib/reporting";
import { finalApprovers } from "@/lib/leave";
import { notify } from "@/lib/notify";
import User from "@/models/User";

const idStr = (v) => (v ? v.toString() : null);

async function refreshAppraisalReviewers(employeeIds, actor = null) {
  try {
    const ids = [...new Set((employeeIds || []).map(idStr).filter(Boolean))];
    if (!ids.length) return 0;
    const cycles = await AppraisalCycle.find({ status: "open" }, { name: 1, dueDate: 1, to: 1 }).lean();
    if (!cycles.length) return 0;
    const open = await Appraisal.find(
      { cycle: { $in: cycles.map((c) => c._id) }, employee: { $in: ids }, "manager.at": null },
      { cycle: 1, employee: 1, reviewer: 1 }
    ).lean();
    if (!open.length) return 0;
    const ctx = await loadLinks();
    const people = Object.fromEntries((await User.find({ _id: { $in: open.map((a) => a.employee) } }, { department: 1 }).lean()).map((u) => [idStr(u._id), u]));
    const moved = {}; // reviewer → Set(cycle)
    let n = 0;
    for (const a of open) {
      const person = people[idStr(a.employee)];
      if (!person) continue;
      // The manager the chart moved them to (a company-wide one too), else their department's.
      const managers = ctx.links.has(idStr(person._id)) ? [ctx.links.get(idStr(person._id))] : await personManagers(person, ctx);
      // Nobody manages them now: the review stays where it is (the CEO can reassign it).
      if (!managers.length || managers.includes(idStr(a.reviewer))) continue;
      await Appraisal.updateOne({ _id: a._id, "manager.at": null }, { $set: { reviewer: managers[0] } });
      (moved[managers[0]] ||= new Set()).add(idStr(a.cycle));
      n++;
    }
    for (const [reviewer, cycleIds] of Object.entries(moved)) {
      for (const c of cycles.filter((x) => cycleIds.has(idStr(x._id)))) {
        await notify({
          type: "appraisal.reassigned",
          recipients: [reviewer],
          actor,
          params: { name: c.name, date: c.dueDate || c.to },
          link: "/dashboard/appraisals",
          entityType: "appraisal_cycle",
          entityId: c._id,
        });
      }
    }
    return n;
  } catch (err) {
    console.error("appraisal reviewers", err);
    return 0;
  }
}

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

async function rerouteRequests(ids, ctx) {
  const people = Object.fromEntries((await User.find({ _id: { $in: ids } }, { name: 1, email: 1, department: 1 }).lean()).map((u) => [idStr(u._id), u]));
  const managersOf = {};
  const managersFor = async (id) => (managersOf[id] ||= await personManagers(people[id], ctx));

  // Leave waiting for the manager step: the new manager decides, or HR / GM straight
  // away when they have none now.
  for (const l of await LeaveRequest.find({ user: { $in: ids }, status: "pending", stage: "manager" }).lean()) {
    const id = idStr(l.user);
    if (!people[id]) continue;
    const managers = await managersFor(id);
    if (l.routed && sameSet(managers, (l.managers || []).map(idStr))) continue;
    const toFinal = !managers.length;
    await LeaveRequest.updateOne({ _id: l._id, status: "pending", stage: "manager" }, { $set: toFinal ? { stage: "final", managers: [], routed: true } : { managers, routed: true } });
    const before = (l.managers || []).map(idStr);
    await notify({
      type: "leave.requested",
      recipients: toFinal ? await finalApprovers(id) : managers.filter((m) => !before.includes(m)),
      actor: id,
      params: { actor: people[id].name || people[id].email, days: l.days, from: l.from, to: l.to },
      link: "/dashboard/orders?type=waiting",
      entityType: "leave",
      entityId: l._id,
    });
  }

  // Pending overtime: the new manager (who may approve overtime), else the CEO.
  for (const o of await OvertimeRequest.find({ user: { $in: ids }, status: "pending" }).lean()) {
    const id = idStr(o.user);
    if (!people[id]) continue;
    const managers = await holding(await managersFor(id), "overtime.approve");
    const before = (o.managers || []).map(idStr);
    if (o.routed && sameSet(managers, before)) continue;
    await OvertimeRequest.updateOne({ _id: o._id, status: "pending" }, { $set: { managers, routed: true } });
    const recipients = managers.length ? managers.filter((m) => !before.includes(m)) : (await User.find({ role: "ceo", status: "active" }, { _id: 1 }).lean()).map((u) => idStr(u._id));
    await notify({
      type: "overtime.requested",
      recipients,
      actor: id,
      params: { actor: people[id].name || people[id].email, hours: o.hours },
      link: "/dashboard/orders?type=waiting",
      entityType: "overtime",
      entityId: o._id,
    });
  }
}

// `employeeIds`: the people whose manager may have changed. Never throws (it's a side
// effect of another change that has already been saved).
export async function followManagerChange(employeeIds, actor = null) {
  const ids = [...new Set((employeeIds || []).map(idStr).filter(Boolean))];
  if (!ids.length) return;
  try {
    await rerouteRequests(ids, await loadLinks());
  } catch (err) {
    console.error("reroute requests", err);
  }
  await refreshAppraisalReviewers(ids, actor);
}
