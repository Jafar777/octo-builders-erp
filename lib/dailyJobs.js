// Jobs run once a day by Vercel Cron (/api/cron/daily). Each job is idempotent, so a
// second run on the same day sends nothing twice.
import { loadFinance } from "@/lib/finance";
import { HOUR, workMsBetween } from "@/lib/gantt";
import { findOverlap, freeSlot, getWorkCalendar } from "@/lib/ganttServer";
import { markOverruns } from "@/lib/projectDelay";
import { attendanceForMonth, hrStaff, todayIn } from "@/lib/hr";
import { purgeExpiredMessages } from "@/lib/messaging";
import { notify, usersWithPermission } from "@/lib/notify";
import { lateTaskCount, projectRisk, rejectionCount, RISK_LEVELS } from "@/lib/projectHealth";
import { buildCells } from "@/lib/projects";
import { sendDigestEmail } from "@/lib/resend";
import { usersWithPermissionFor } from "@/lib/scope";
import { getSettings } from "@/lib/settings";
import { ACTIVE_STATUSES, addInterval, enrichTasks, publishTaskChange, reviewersFor, taskTitle } from "@/lib/tasks";
import AttendanceDevice from "@/models/AttendanceDevice";
import { nextNumber } from "@/models/Counter";
import Notification from "@/models/Notification";
import Task from "@/models/Task";
import User from "@/models/User";
import WorkProject from "@/models/WorkProject";

const idStr = (v) => (v ? v.toString() : null);
const DAY = 86400000;

// True if this notification (type + marker) was already sent — keeps jobs idempotent.
const alreadySent = (type, entityId) => Notification.exists({ type, entityId });

// --- tasks: due within 24h, overdue -------------------------------------------------
export async function taskReminders(now = new Date()) {
  const soon = new Date(now.getTime() + DAY);
  const dueSoon = await Task.find({ status: { $in: ACTIVE_STATUSES }, dueAt: { $gt: now, $lte: soon }, dueReminderSent: false }).lean();
  const overdue = await Task.find({ status: { $in: ACTIVE_STATUSES }, dueAt: { $lte: now }, overdueNotified: false }).lean();
  const [soonEnriched, overdueEnriched] = await Promise.all([enrichTasks(dueSoon), enrichTasks(overdue)]);

  for (const t of soonEnriched) {
    await notify({
      type: "task.due_soon",
      recipients: [t.assignee.id],
      params: { number: t.number, title: taskTitle(t) },
      link: `/dashboard/tasks?task=${t.id}`,
      entityType: "task",
      entityId: t.id,
    });
  }
  for (let i = 0; i < overdue.length; i += 1) {
    const t = overdueEnriched[i];
    await notify({
      type: "task.overdue",
      recipients: [t.assignee.id, ...(await reviewersFor(overdue[i]))],
      params: { number: t.number, title: taskTitle(t) },
      link: `/dashboard/tasks?task=${t.id}`,
      entityType: "task",
      entityId: t.id,
    });
  }
  await Task.updateMany({ _id: { $in: dueSoon.map((t) => t._id) } }, { dueReminderSent: true });
  await Task.updateMany({ _id: { $in: overdue.map((t) => t._id) } }, { overdueNotified: true });
  return { dueSoon: dueSoon.length, overdue: overdue.length };
}

// --- repeating tasks: create the next copies up to 36 hours ahead ---------------------
export async function repeatTasks(now = new Date()) {
  const horizon = new Date(now.getTime() + 1.5 * DAY);
  const roots = await Task.find({ "recurrence.freq": { $in: ["daily", "weekly", "monthly"] }, "recurrence.nextAt": { $lte: horizon } });
  let created = 0;
  for (const root of roots) {
    if (root.status === "cancelled") continue;
    const rule = root.recurrence;
    const assigneeActive = await User.exists({ _id: root.assignee, status: "active" });
    const creator = await User.findById(root.createdBy, { name: 1, nameAr: 1, email: 1 }).lean();
    while (rule.nextAt && rule.nextAt <= horizon && (!rule.until || rule.nextAt <= rule.until)) {
      const shift = rule.nextAt.getTime() - root.dueAt.getTime();
      if (assigneeActive) {
        let plannedStart = root.plannedStart ? new Date(root.plannedStart.getTime() + shift) : null;
        let dueAt = rule.nextAt;
        // The copy can't land on top of the employee's other work: it takes their next free gap.
        if (plannedStart && root.kind !== "meeting" && (await findOverlap(root.assignee, plannedStart, dueAt))) {
          const cal = await getWorkCalendar();
          const slot = await freeSlot(root.assignee, plannedStart.getTime(), workMsBetween(plannedStart.getTime(), dueAt.getTime(), cal) || HOUR, cal);
          plannedStart = new Date(slot.start);
          dueAt = new Date(slot.end);
        }
        const copy = await Task.create({
          number: await nextNumber("task"),
          kind: root.kind,
          title: root.title,
          project: root.project,
          department: root.department,
          type: root.type,
          assignee: root.assignee,
          createdBy: root.createdBy,
          priority: root.priority,
          plannedStart,
          dueAt,
          estimatedHours: root.estimatedHours,
          description: root.description,
          recurrenceOf: root._id,
        });
        created += 1;
        if (idStr(root.assignee) !== idStr(root.createdBy)) {
          const [enriched] = await enrichTasks([copy.toObject()]);
          await notify({
            type: "task.assigned",
            recipients: [idStr(root.assignee)],
            actor: idStr(root.createdBy),
            params: { actor: creator?.name || creator?.email || "", number: copy.number, title: taskTitle(enriched) },
            paramsAr: { actor: creator?.nameAr || creator?.name || creator?.email || "" },
            link: `/dashboard/tasks?task=${copy._id}`,
            entityType: "task",
            entityId: copy._id,
          });
        }
        await publishTaskChange(copy);
      }
      rule.nextAt = addInterval(rule.nextAt, rule.freq, rule.interval);
    }
    if (rule.until && rule.nextAt > rule.until) rule.freq = "";
    root.markModified("recurrence");
    await root.save();
  }
  return { created };
}

// --- attendance: yesterday's missing check-outs ------------------------------------
export async function missingCheckouts(settings) {
  const tz = settings.hr.timezone;
  const today = todayIn(tz);
  const yesterday = new Date(new Date(`${today}T00:00:00Z`).getTime() - DAY).toISOString().slice(0, 10);
  const staff = (await hrStaff({ status: "active" })).filter((s) => s.badgeId);
  if (!staff.length) return { missing: 0 };
  const month = yesterday.slice(0, 7);
  const attendance = await attendanceForMonth(staff, month, settings);
  const missing = staff.filter((s) => attendance[s.id]?.days.find((d) => d.date === yesterday)?.missingCheckOut);

  for (const s of missing) {
    const marker = `${s.id}:${yesterday}`;
    if (await alreadySent("attendance.missing_checkout", marker)) continue;
    await notify({
      type: "attendance.missing_checkout",
      recipients: [s.id],
      params: { date: yesterday, name: "" },
      link: `/dashboard/attendance?month=${month}`,
      entityType: "attendance",
      entityId: marker,
    });
  }
  // One summary for HR.
  if (missing.length && !(await alreadySent("attendance.missing_checkout", `hr:${yesterday}`))) {
    await notify({
      type: "attendance.missing_checkout",
      recipients: await usersWithPermission("attendance.manage"),
      params: { date: yesterday, name: missing.map((s) => s.nameEn).join(", ") },
      paramsAr: { name: missing.map((s) => s.nameAr).join("، ") },
      link: `/dashboard/hr?month=${month}`,
      entityType: "attendance",
      entityId: `hr:${yesterday}`,
    });
  }
  return { missing: missing.length };
}

// --- HR: contracts ending in 30 and 7 days -----------------------------------------
export async function contractsEnding(settings) {
  const today = todayIn(settings.hr.timezone);
  const staff = await hrStaff({ status: "active", contractEnd: { $ne: "" } });
  const hr = [...new Set([...(await usersWithPermission("payroll.manage")), ...(await usersWithPermission("users.manage"))])];
  let sent = 0;
  for (const s of staff) {
    const days = Math.round((new Date(`${s.contractEnd}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / DAY);
    if (days < 0 || days > 30) continue;
    const step = days <= 7 ? 7 : 30;
    const marker = `${s.id}:${s.contractEnd}:${step}`;
    if (await alreadySent("hr.contract_ending", marker)) continue;
    await notify({
      type: "hr.contract_ending",
      recipients: hr,
      params: { name: s.nameEn, date: s.contractEnd, days },
      paramsAr: { name: s.nameAr },
      link: `/dashboard/staff?person=${s.id}`,
      entityType: "contract",
      entityId: marker,
    });
    sent += 1;
  }
  return { contracts: sent };
}

// --- fingerprint devices that stopped syncing (also checked when HR opens the page) ---
export async function offlineDevices(now = new Date(), hours = 6) {
  const limit = new Date(now.getTime() - hours * 3600000);
  const devices = await AttendanceDevice.find({
    active: true,
    offlineNotified: { $ne: true },
    $or: [{ lastSeenAt: { $lt: limit } }, { lastSeenAt: null, createdAt: { $lt: limit } }],
  });
  if (!devices.length) return { offline: 0 };
  const recipients = await usersWithPermission("attendance.manage");
  for (const d of devices) {
    const since = d.lastSeenAt || d.createdAt;
    await notify({
      type: "hr.device_offline",
      recipients,
      params: { device: d.name, hours: Math.round((now - since) / 3600000) },
      link: "/dashboard/hr?tab=devices",
      entityType: "device",
      entityId: d._id,
    });
    d.offlineNotified = true;
    await d.save();
  }
  return { offline: devices.length };
}

// --- projects: risk got worse --------------------------------------------------------
export async function projectRiskChanges(now = Date.now()) {
  const projects = await WorkProject.find({ status: { $in: ["active", "on_hold"] } });
  const tasks = await Task.find(
    { project: { $in: projects.map((p) => p._id) } },
    { project: 1, item: 1, stage: 1, revision: 1, status: 1, kind: 1, createdAt: 1, assignee: 1, dueAt: 1, submittedAt: 1, estimatedHours: 1, maxHours: 1 }
  ).lean();
  let raised = 0;
  for (const p of projects) {
    const list = tasks.filter((t) => idStr(t.project) === p._id.toString());
    const { progress } = buildCells(p, list);
    const risk = projectRisk(p, progress, lateTaskCount(list, now), rejectionCount(list), now);
    const before = RISK_LEVELS.indexOf(p.riskLevel || "healthy");
    if (RISK_LEVELS.indexOf(risk.level) > before && ["high", "critical"].includes(risk.level)) {
      const recipients = [idStr(p.manager), ...(await usersWithPermissionFor("tasks.review", p.department)), ...(await usersWithPermissionFor("analytics.view", p.department))];
      const levels = { high: { ar: "مرتفع", en: "high" }, critical: { ar: "حرج", en: "critical" } };
      await notify({
        type: "project.risk_changed",
        recipients: [...new Set(recipients.filter(Boolean))],
        params: { project: p.code || p.name.en || p.name.ar, levelAr: levels[risk.level].ar, levelEn: levels[risk.level].en },
        link: `/dashboard/projects/${p._id}`,
        entityType: "project",
        entityId: p._id,
      });
      raised += 1;
    }
    if (p.riskLevel !== risk.level) {
      p.riskLevel = risk.level;
      await p.save();
    }
  }
  return { riskRaised: raised };
}

// --- finance: projects going over budget ---------------------------------------------
export async function overBudget(settings) {
  if (!(await WorkProject.exists({ budget: { $gt: 0 }, budgetAlertSent: { $ne: true } }))) return { overBudget: 0 };
  const finance = await loadFinance(todayIn(settings.hr.timezone).slice(0, 4));
  const over = finance.projects.filter((p) => p.overBudget);
  const flagged = new Set((await WorkProject.find({ _id: { $in: over.map((p) => p.id) }, budgetAlertSent: true }, { _id: 1 }).lean()).map((p) => p._id.toString()));
  const recipients = await usersWithPermission("finance.manage");
  let sent = 0;
  for (const p of over) {
    if (flagged.has(p.id)) continue;
    await notify({
      type: "finance.over_budget",
      recipients: [...new Set([...recipients, p.manager].filter(Boolean))],
      params: { project: p.code || p.name?.en || p.name?.ar, cost: p.cost, budget: p.budget, currency: finance.base },
      link: `/dashboard/finance?tab=projects&project=${p.id}`,
      entityType: "project",
      entityId: p.id,
    });
    await WorkProject.updateOne({ _id: p.id }, { budgetAlertSent: true });
    sent += 1;
  }
  return { overBudget: sent };
}

// --- daily email digest of unread notifications --------------------------------------
export async function digest(now = new Date()) {
  const since = new Date(now.getTime() - DAY);
  const pending = await Notification.find({ read: false, emailedAt: null, createdAt: { $gte: since } }).sort({ createdAt: -1 }).lean();
  const byUser = {};
  for (const n of pending) (byUser[n.user.toString()] ||= []).push(n);
  const users = await User.find({ _id: { $in: Object.keys(byUser) }, status: "active", "notificationPrefs.digest": { $ne: false } }, { email: 1 }).lean();
  let sent = 0;
  for (const u of users) {
    const items = byUser[u._id.toString()];
    try {
      await sendDigestEmail({ to: u.email, items });
      await Notification.updateMany({ _id: { $in: items.map((n) => n._id) } }, { emailedAt: now });
      sent += 1;
    } catch (err) {
      console.error("digest email error", err?.message || err);
    }
  }
  return { digests: sent };
}

// Runs every job; one failing job doesn't stop the others.
export async function runDailyJobs() {
  const settings = await getSettings();
  const jobs = {
    taskReminders: () => taskReminders(),
    overruns: () => markOverruns(),
    repeatTasks: () => repeatTasks(),
    missingCheckouts: () => missingCheckouts(settings),
    contractsEnding: () => contractsEnding(settings),
    offlineDevices: () => offlineDevices(),
    projectRiskChanges: () => projectRiskChanges(),
    overBudget: () => overBudget(settings),
    digest: () => digest(),
    purgeMessages: () => purgeExpiredMessages(),
  };
  const result = {};
  for (const [name, job] of Object.entries(jobs)) {
    try {
      result[name] = await job();
    } catch (err) {
      console.error("daily job failed", name, err);
      result[name] = { error: String(err?.message || err) };
    }
  }
  return result;
}
