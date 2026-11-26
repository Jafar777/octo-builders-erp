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
import RawPunch, { ACTIVE_PUNCH } from "@/models/RawPunch";
import Task from "@/models/Task";
import User from "@/models/User";
import WorkProject from "@/models/WorkProject";
import { NAME_FIELDS, pickName, viewerLang } from "@/lib/personName";
import { inDepartments, userDepartments } from "@/lib/scope";
import { homePersona } from "@/lib/homePersona";
import { canDecideAny, isOvertimeAdmin, managerOvertimeFilter } from "@/lib/overtime";
import { managerLeaveFilter } from "@/lib/leave";
import { isDeptManager } from "@/lib/managerKpi";
import { canOpenPath } from "@/lib/pageAccess";
import { reachedIds } from "@/lib/reporting";
import { canSeeIntakeFinance, isIntakePlanner } from "@/lib/intake";
import Invoice from "@/models/Invoice";
import Lead from "@/models/Lead";
import OfficeItem from "@/models/OfficeItem";
import { canConfirmChange, pendingChanges } from "@/lib/clientChangeServer";
import { canUseOffice, inboxQuery, officeDayCounts, officePulse } from "@/lib/officeServer";
import { isTopRole } from "@/lib/permissions";
import OvertimeRequest from "@/models/OvertimeRequest";
import ProjectIntake from "@/models/ProjectIntake";
import PurchaseRequest from "@/models/PurchaseRequest";
import Quotation from "@/models/Quotation";

const idStr = (v) => (v ? v.toString() : null);

// The home screen: one call, sections chosen by the viewer's permissions
// (employee, reviewer, HR, project manager, finance, GM).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return forbidden();
  if (!user.isStaff || user.limited) return NextResponse.json({ sections: [] });

  const settings = await getSettings();
  const tz = settings.hr.timezone;
  const today = todayIn(tz);
  const month = today.slice(0, 7);
  const now = Date.now();
  const can = (p) => hasPermission(user, p);
  const deptFilter = user.scope === "all" ? {} : inDepartments(user);
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
        // Their team (lib/reporting.js: their departments' people and anyone moved to them).
        const staff = await hrStaff({ status: "active", ...(user.scope === "all" ? {} : { _id: { $in: await reachedIds(user) } }) });
        const punches = await RawPunch.find({ time: { $gte: new Date(now - 36 * 3600000) }, ...ACTIVE_PUNCH }, { badgeId: 1, time: 1 }).lean();
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

  // --- HR: leave waiting at the HR / GM step, contracts ending, devices offline — the
  // whole company's, so only for company-wide HR / GM / CEO (department managers get
  // their team's leave under "needs", below).
  if (user.scope === "all" && (can("leave.approve") || can("attendance.manage")) && canOpenPath(user, "/dashboard/hr")) {
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
  if (can("finance.view") && canOpenPath(user, "/dashboard/finance")) {
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
  if (can("users.manage") && canOpenPath(user, "/dashboard/staff")) {
    jobs.push(
      (async () => {
        // Customers linked to a project have no role on purpose: they're not waiting for one.
        const customers = await WorkProject.distinct("customer", { customer: { $ne: null } });
        out.pendingSignups = await User.countDocuments({ role: "user", status: "active", _id: { $nin: customers } });
      })()
    );
  }

  // --- "Needs you": every queue this person can act on, with its count and where to act.
  out.persona = homePersona(user);
  jobs.push(
    (async () => {
      const deps = userDepartments(user);
      const q = [];
      const add = (key, href, promise) => q.push(Promise.resolve(promise).then((count) => ({ key, href, count })).catch(() => ({ key, href, count: 0 })));
      if (canDecideAny(user)) {
        add("overtime", "/dashboard/orders?type=waiting", OvertimeRequest.countDocuments({ status: "pending", user: { $ne: user.id }, ...(isOvertimeAdmin(user) ? {} : managerOvertimeFilter(user)) }));
      }
      // Leave at the department manager's step (their departments), or at HR / GM's.
      // (Department managers decide it whatever their permissions say — lib/leave.js —
      // on the Requests page, which everyone can open.)
      if (isDeptManager(user)) add("leaveManager", "/dashboard/orders?type=waiting", LeaveRequest.countDocuments({ status: "pending", stage: "manager", ...managerLeaveFilter(user), user: { $ne: user.id } }));
      if (user.scope === "all" && can("leave.approve")) add("leave", "/dashboard/orders?type=waiting", LeaveRequest.countDocuments({ status: "pending", stage: { $ne: "manager" } }));
      if (can("purchasing.approve")) {
        add("purchases", "/dashboard/orders?type=waiting", PurchaseRequest.countDocuments({ status: "pending", requestedBy: { $ne: user.id }, ...(user.scope === "all" ? {} : { department: { $in: deps } }) }));
      }
      if (canSeeIntakeFinance(user)) add("intakePricing", "/dashboard/intake", ProjectIntake.countDocuments({ status: "new" }));
      if (isIntakePlanner(user)) add("intakeAccept", "/dashboard/intake", ProjectIntake.countDocuments({ status: "ready", "proposal.at": { $ne: null } }));
      if (can("invoices.manage")) add("invoices", "/dashboard/finance?tab=invoices", Invoice.countDocuments({ status: "draft" }));
      if (can("sales.manage")) add("staleLeads", "/dashboard/finance?tab=sales", Lead.countDocuments({ stage: { $in: ["new", "contacted", "meeting", "proposal"] }, updatedAt: { $lt: new Date(now - 7 * 86400000) } }));
      if (can("users.manage") && user.scope === "all") add("skills", "/dashboard/staff", User.countDocuments({ status: { $ne: "inactive" }, skillRequests: { $elemMatch: { status: "pending" } } }));
      // Managers' client-change requests: the CEO decides (opens the oldest).
      if (canConfirmChange(user)) {
        const list = await pendingChanges();
        if (list.length) add("clientChanges", `/dashboard/tasks?task=${list[0].task}`, list.length);
      }
      // What the executive office sent them / their departments, still unanswered.
      add("officeInbox", "/dashboard/office/inbox", OfficeItem.countDocuments(inboxQuery(user)));
      // Late work in the departments (or company) they run.
      if (["department", "projects", "executive"].includes(out.persona)) {
        add("lateTasks", "/dashboard/team-tasks?late=1", Task.countDocuments({ ...(user.scope === "all" ? {} : { department: { $in: deps } }), status: { $in: ACTIVE_STATUSES }, dueAt: { $lt: new Date(now) } }));
      }
      // Only what they can open: a count that leads to "no access" helps nobody.
      out.needs = (await Promise.all(q)).filter((x) => x.count > 0 && canOpenPath(user, x.href));
    })()
  );
  // Office: intake forms and the sales pipeline at a glance.
  if (can("sales.manage") || can("projects.intake")) {
    jobs.push(
      (async () => {
        const [intakesNew, leadsOpen, quotesSent] = await Promise.all([
          ProjectIntake.countDocuments({ status: { $in: ["new", "ready"] } }),
          can("sales.manage") ? Lead.countDocuments({ stage: { $in: ["new", "contacted", "meeting", "proposal"] } }) : null,
          can("sales.manage") ? Quotation.countDocuments({ status: "sent" }) : null,
        ]);
        out.office = { intakesNew, leadsOpen, quotesSent };
      })()
    );
  }

  // The executive office: its day (the secretary), and its pulse (the CEO).
  if (canUseOffice(user)) {
    jobs.push(
      officeDayCounts(tz).then((c) => {
        out.officeDay = c;
      })
    );
    if (isTopRole(user.role)) {
      jobs.push(
        officePulse(tz).then((p) => {
          out.officePulse = p;
        })
      );
    }
  }

  await Promise.all(jobs);
  // Their own arrangement of this page (app/api/home/layout).
  const saved = await User.findById(user.id, { homeLayout: 1 }).lean();
  out.layout = { order: saved?.homeLayout?.order || [], hidden: saved?.homeLayout?.hidden || [], tiles: saved?.homeLayout?.tiles || [] };
  return NextResponse.json(out);
}
