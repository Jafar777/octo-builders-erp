// What a customer follows of their project, besides its stages:
//   - milestones: tasks the management ticked "show to the customer" (Task.customerMilestone)
//     — the customer sees only their title and whether they're done;
//   - payments: the project's milestones with billing (set as payment stages on the
//     intake form, or added on the Gantt). Each waits for the task(s) chosen for it; when
//     those are approved the payment is due — the customer sees "Payment 2 is due",
//     never the tasks. Paid = the project's payments received so far cover it (in order).

import { draftMilestoneInvoice, projectContract } from "@/lib/books";
import { notify, usersWithPermission } from "@/lib/notify";
import FinanceEntry from "@/models/FinanceEntry";
import Task from "@/models/Task";
import WorkProject from "@/models/WorkProject";

const idStr = (v) => (v ? v.toString() : null);
export const DONE = ["approved", "done"];
const r2 = (n) => Math.round(n * 100) / 100;

// Task ids → done? A rejected task counts as done once a later revision of it is approved.
export async function tasksDone(ids) {
  const out = {};
  const want = [...new Set(ids.map(idStr).filter(Boolean))];
  if (!want.length) return out;
  const tasks = await Task.find({ _id: { $in: want } }, { status: 1 }).lean();
  let open = [];
  for (const t of tasks) {
    out[idStr(t._id)] = DONE.includes(t.status);
    if (!out[idStr(t._id)] && t.status !== "cancelled") open.push(idStr(t._id));
  }
  // Follow each open task's revisions (at most 20 deep).
  const root = Object.fromEntries(open.map((id) => [id, id]));
  for (let depth = 0; open.length && depth < 20; depth++) {
    const next = await Task.find({ previousTask: { $in: open } }, { status: 1, previousTask: 1 }).lean();
    open = [];
    for (const n of next) {
      const r = root[idStr(n.previousTask)];
      root[idStr(n._id)] = r;
      if (DONE.includes(n.status)) out[r] = true;
      else open.push(idStr(n._id));
    }
  }
  return out;
}

// The billed milestones of a project, in order: its payment stages.
export const paymentStages = (project) => (project.milestones || []).filter((m) => m.billPercent > 0 || m.billAmount > 0);

// A task was approved: payment stages (and other milestones) waiting only for finished
// tasks are reached now — the invoice is drafted, finance and the customer are told.
export async function reachMilestones(task, actor) {
  if (!task.project) return;
  // The task and the tasks it is a revision of.
  const chain = [task._id];
  let prev = task.previousTask;
  for (let i = 0; prev && i < 20; i++) {
    chain.push(prev);
    prev = (await Task.findById(prev, { previousTask: 1 }).lean())?.previousTask || null;
  }
  const project = await WorkProject.findOne({ _id: task.project, milestones: { $elemMatch: { doneAt: null, dependsOn: { $in: chain } } } });
  if (!project) return;
  const stages = paymentStages(project).map((m) => idStr(m._id));
  let changed = false;
  for (const m of project.milestones) {
    if (m.doneAt || !(m.dependsOn || []).length || !m.dependsOn.some((d) => chain.some((c) => idStr(c) === idStr(d)))) continue;
    const done = await tasksDone(m.dependsOn);
    if (!m.dependsOn.every((d) => done[idStr(d)])) continue;
    m.doneAt = new Date();
    changed = true;
    const invoice = await draftMilestoneInvoice(project, m, actor?.id || null);
    if (invoice) {
      await notify({
        type: "invoice.drafted",
        recipients: await usersWithPermission("invoices.manage"),
        actor: actor?.isStaff ? actor : null,
        params: { actor: actor?.name || "", project: project.name?.ar || project.code, milestone: m.name, amount: `${invoice.total} ${invoice.currency}` },
        link: "/dashboard/finance?tab=invoices",
        entityType: "invoice",
        entityId: invoice._id,
      });
    }
    const n = stages.indexOf(idStr(m._id)) + 1;
    if (n > 0 && project.customer) {
      await notify({
        type: "customer.payment_due",
        recipients: [idStr(project.customer)],
        params: { n, project: project.name?.en || project.name?.ar || project.code },
        paramsAr: { project: project.name?.ar || project.name?.en || project.code },
        link: "/dashboard",
        entityType: "project",
        entityId: project._id,
      });
    }
  }
  if (changed) await project.save();
}

// The customer's view of one project's milestones and payments.
export async function customerExtras(project, tasks) {
  const ticked = tasks.filter((t) => t.customerMilestone);
  const done = await tasksDone(ticked.map((t) => t._id));
  const milestones = ticked
    .sort((a, b) => new Date(a.dueAt || a.createdAt) - new Date(b.dueAt || b.createdAt))
    .map((t) => ({ id: idStr(t._id), title: t.customerTitle || t.title, done: Boolean(done[idStr(t._id)]) }));

  const stages = paymentStages(project);
  if (!stages.length) return { milestones, payments: null };
  const contract = await projectContract(project._id);
  const rate = contract.rate || 1;
  const received = (await FinanceEntry.find({ project: project._id, kind: "payment" }, { baseAmount: 1 }).lean()).reduce((s, e) => s + (e.baseAmount || 0), 0);
  let covered = received;
  const list = stages.map((m, i) => {
    const base = m.billAmount > 0 ? m.billAmount / rate : (contract.base * m.billPercent) / 100;
    const paid = covered + 0.01 >= base;
    covered = Math.max(0, covered - base);
    return { n: i + 1, amount: r2(base * rate), percent: m.billAmount > 0 ? null : m.billPercent, status: paid ? "paid" : m.doneAt ? "due" : "upcoming", dueSince: m.doneAt || null };
  });
  return {
    milestones,
    payments: { currency: contract.currency, total: r2(contract.base * rate), paid: r2(received * rate), remaining: r2(Math.max(0, contract.base - received) * rate), stages: list },
  };
}
