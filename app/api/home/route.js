import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { localParts } from "@/lib/attendance";
import { loadFinance } from "@/lib/finance";
import { attendanceForMonth, hrStaff, tasksForMonth, todayIn, withActualHours } from "@/lib/hr";
import { serializeNotification } from "@/lib/notify";
import { lateTaskCount, projectRisk, rejectionCount } from "@/lib/projectHealth";
import { buildCells } from "@/lib/projects";
import { getSettings } from "@/lib/settings";
import { ACTIVE_STATUSES, enrichTasks } from "@/lib/tasks";
import { queueQuery } from "@/lib/taskReview";
import AttendanceDevice from "@/models/AttendanceDevice";
import LeaveRequest from "@/models/LeaveRequest";
import Notification from "@/models/Notification";
import RawPunch from "@/models/RawPunch";
import Task from "@/models/Task";
import User from "@/models/User";
import WorkProject from "@/models/WorkProject";
import { NAME_FIELDS, pickName, viewerLang } from "@/lib/personName";

const idStr = (v) => (v ? v.toString() : null);

// The home screen: one call, sections chosen by the viewer's permissions
// (employee, reviewer, HR, project manager, finance, GM).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return forbidden();
  if (!user.isStaff) return NextResponse.json({ sections: [] });

  const settings = await getSettings();
  const tz = settings.hr.timezone;
  const today = todayIn(tz);
  const month = today.slice(0, 7);
  const now = Date.now();
  const can = (p) => hasPermission(user, p);
  const deptFilter = user.scope === "all" ? {} : { department: user.department };
  const lang = await viewerLang();
  const out = {};

  const jobs = [];

  // --- me: open tasks, my month so far, unread notifications
  jobs.push(
    (async () => {
      const tasks = await Task.find({ assignee: user.id, status: { $in: ACTIVE_STATUSES } }).sort({ dueAt: 1 }).limit(8).lean();
      out.myTasks = {
        open: await Task.countDocuments({ assignee: user.id, status: { $in: ACTIVE_STATUSES } }),
        overdue: await Task.countDocuments({ assignee: user.id, status: { $in: ACTIVE_STATUSES }, dueAt: { $lt: new Date() } }),
        submitted: await Task.countDocuments({ assignee: user.id, status: "submitted" }),
        list: await enrichTasks(tasks),
      };
    })()
  );
  jobs.push(
    (async () => {
      const [me] = await hrStaff({ _id: user.id });
      if (!me) return;
      const att = withActualHours(await attendanceForMonth([me], month, settings), await tasksForMonth(month, [me.id], settings.hr.timezone))[me.id];
      const s = att?.summary;
      if (s) out.myMonth = { worked: s.workedHours, actual: s.actualHours, required: s.requiredToDate, efficiency: s.efficiency, warnings: s.warnings, late: s.lateCount, overtime: s.overtimeHours };
    })()
  );
  jobs.push(
    (async () => {
      const list = await Notification.find({ user: user.id, read: false }).sort({ createdAt: -1 }).limit(5).lean();
      out.notifications = list.map(serializeNotification);
    })()
  );

  // --- reviewer: work waiting for approval
  if (can("tasks.review")) {
    jobs.push(
      (async () => {
        // Only the work waiting for this reviewer's level (lib/taskReview).
        const query = await queueQuery(user);
        const list = query ? await Task.find(query).sort({ submittedAt: 1 }).limit(5).lean() : [];
        out.reviews = { count: query ? await Task.countDocuments(query) : 0, list: await enrichTasks(list) };
      })()
    );
  }

  // --- managers: projects at risk + who's in today
  if (can("analytics.view")) {
    jobs.push(
      (async () => {
        const projects = await WorkProject.find({ ...deptFilter, status: { $in: ["active", "on_hold"] } }).lean();
        const tasks = await Task.find(
          { project: { $in: projects.map((p) => p._id) } },
          { project: 1, item: 1, stage: 1, revision: 1, status: 1, kind: 1, createdAt: 1, assignee: 1, dueAt: 1, submittedAt: 1, estimatedHours: 1, maxHours: 1 }
        ).lean();
        const rows = projects.map((p) => {
          const list = tasks.filter((t) => idStr(t.project) === p._id.toString());
          const { progress } = buildCells(p, list);
          const risk = projectRisk(p, progress, lateTaskCount(list, now), rejectionCount(list), now);
          return { id: p._id.toString(), name: p.name, code: p.code, progress: Math.round(progress * 100), dueDate: p.dueDate, ...risk };
        });
        out.projects = {
          active: projects.filter((p) => p.status === "active").length,
          atRisk: rows.filter((r) => ["high", "critical"].includes(r.level)).length,
          top: rows.sort((a, b) => b.score - a.score).slice(0, 4),
        };
      })()
    );
    jobs.push(
      (async () => {
        const staff = await hrStaff({ status: "active", ...(user.scope === "all" ? {} : { department: user.department }) });
        const punches = await RawPunch.find({ time: { $gte: new Date(now - 36 * 3600000) } }, { badgeId: 1, time: 1 }).lean();
        const inToday = new Set(punches.filter((p) => localParts(p.time, tz).date === today).map((p) => p.badgeId));
        const onLeave = await LeaveRequest.countDocuments({ status: "approved", from: { $lte: today }, to: { $gte: today }, user: { $in: staff.map((s) => s.id) } });
        const working = await Task.distinct("assignee", { status: "in_progress", assignee: { $in: staff.map((s) => s.id) } });
        out.team = {
          total: staff.length,
          present: staff.filter((s) => s.badgeId && inToday.has(s.badgeId)).length,
          onLeave,
          working: working.length,
        };
      })()
    );
  }

  // --- HR: leave waiting, contracts ending, devices offline
  if (can("leave.approve") || can("attendance.manage")) {
    jobs.push(
      (async () => {
        const in30 = new Date(new Date(`${today}T00:00:00Z`).getTime() + 30 * 86400000).toISOString().slice(0, 10);
        const [pendingLeave, ending, devices] = await Promise.all([
          // Waiting for HR / GM (requests still with a department manager aren't theirs yet).
          can("leave.approve") ? LeaveRequest.countDocuments({ status: "pending", stage: { $ne: "manager" } }) : 0,
          User.find({ status: "active", contractEnd: { $gte: today, $lte: in30 } }, { ...NAME_FIELDS, contractEnd: 1 }).sort({ contractEnd: 1 }).lean(),
          AttendanceDevice.find({ active: true }, { name: 1, lastSeenAt: 1 }).lean(),
        ]);
        out.hr = {
          pendingLeave,
          contractsEnding: ending.map((u) => ({ id: u._id.toString(), name: pickName(u, lang), date: u.contractEnd })),
          devicesOffline: devices.filter((d) => !d.lastSeenAt || now - new Date(d.lastSeenAt).getTime() > 6 * 3600000).map((d) => d.name),
        };
      })()
    );
  }

  // --- finance: fund balances, receivables, this month's result
  if (can("finance.view")) {
    jobs.push(
      (async () => {
        const f = await loadFinance(today.slice(0, 4));
        const m = f.monthly.find((x) => x.month === month);
        out.finance = {
          base: f.base,
          funds: f.funds.map((x) => ({ name: x.name, balance: x.balance, inTransit: x.inTransit })),
          receivables: f.totals.receivables,
          receivedYear: f.totals.received,
          netYear: f.totals.netProfit,
          monthNet: m?.net ?? 0,
          overBudget: f.projects.filter((p) => p.overBudget).length,
        };
      })()
    );
  }

  // --- GM: people waiting for a role
  if (can("users.manage")) {
    jobs.push(
      (async () => {
        // Customers linked to a project have no role on purpose: they're not waiting for one.
        const customers = await WorkProject.distinct("customer", { customer: { $ne: null } });
        out.pendingSignups = await User.countDocuments({ role: "user", status: "active", _id: { $nin: customers } });
      })()
    );
  }

  await Promise.all(jobs);
  return NextResponse.json(out);
}
