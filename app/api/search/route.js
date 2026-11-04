import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { pickName, viewerLang } from "@/lib/personName";
import { projectQueryFor } from "@/lib/projects";
import { outsideRoleKeys } from "@/lib/scope";
import { canViewTask } from "@/lib/tasks";
import Asset from "@/models/Asset";
import Client from "@/models/Client";
import Invoice from "@/models/Invoice";
import Lead from "@/models/Lead";
import Task from "@/models/Task";
import User from "@/models/User";
import WorkProject from "@/models/WorkProject";

const idStr = (v) => (v ? v.toString() : null);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The dashboard's search box (Ctrl+K): projects, tasks (#number or words), people,
// clients, invoices, leads and assets — only what the viewer may open. ?q=
export async function GET(request) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const q = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ results: [] });
  const re = new RegExp(escape(q), "i");
  const lang = await viewerLang();
  const results = [];
  const number = Number(q.replace(/^#/, ""));

  const projectScope = await projectQueryFor(user);
  const projects = await WorkProject.find({ $and: [projectScope, { $or: [{ "name.ar": re }, { "name.en": re }, { code: re }, { client: re }] }] }, { name: 1, code: 1, status: 1 })
    .limit(6)
    .lean();
  for (const p of projects) results.push({ type: "project", id: idStr(p._id), title: p.name?.[lang] || p.name?.en, sub: p.code, href: `/dashboard/projects/${idStr(p._id)}` });

  const taskQuery = Number.isInteger(number) && number > 0 ? { number } : { $or: [{ title: re }, { description: re }] };
  const tasks = await Task.find(taskQuery, { number: 1, title: 1, project: 1, stage: 1, assignee: 1, department: 1, createdBy: 1, status: 1, review: 1 }).limit(20).lean();
  // Named like everywhere else: the project's name first, then the task's.
  const shownTasks = tasks.filter((x) => canViewTask(user, x)).slice(0, 6);
  const taskProjects = await WorkProject.find({ _id: { $in: shownTasks.map((x) => x.project).filter(Boolean) } }, { name: 1 }).lean();
  const projectName = Object.fromEntries(taskProjects.map((p) => [idStr(p._id), p.name?.[lang] || p.name?.en]));
  for (const t of shownTasks) {
    const own = t.title || t.stage || t.status;
    const proj = projectName[idStr(t.project)];
    results.push({ type: "task", id: idStr(t._id), title: `#${t.number} ${proj || own}`, sub: proj ? own : "", href: `/dashboard/tasks?task=${idStr(t._id)}` });
  }

  const people = await User.find({ status: "active", role: { $nin: await outsideRoleKeys() }, $or: [{ name: re }, { nameAr: re }, { email: re }] }, { name: 1, nameAr: 1, email: 1 })
    .limit(6)
    .lean();
  for (const p of people) {
    results.push({ type: "person", id: idStr(p._id), title: pickName(p, lang), sub: p.email, href: hasPermission(user, "users.view") ? `/dashboard/staff?person=${idStr(p._id)}` : "/dashboard/organization" });
  }

  if (hasPermission(user, "finance.view") || hasPermission(user, "invoices.manage")) {
    const clients = await Client.find({ name: re }, { name: 1 }).limit(4).lean();
    for (const c of clients) results.push({ type: "client", id: idStr(c._id), title: c.name, href: "/dashboard/finance?tab=clients" });
    const invoices = await Invoice.find({ $or: [{ number: re }, { clientName: re }] }, { number: 1, clientName: 1, total: 1, currency: 1 }).limit(4).lean();
    for (const i of invoices) results.push({ type: "invoice", id: idStr(i._id), title: i.number || i.clientName, sub: `${i.total} ${i.currency}`, href: "/dashboard/finance?tab=invoices" });
  }
  if (hasPermission(user, "sales.manage")) {
    const leads = await Lead.find({ $or: [{ name: re }, { company: re }, { phone: re }] }, { name: 1, company: 1, stage: 1 }).limit(4).lean();
    for (const l of leads) results.push({ type: "lead", id: idStr(l._id), title: l.company || l.name, sub: l.stage, href: "/dashboard/sales" });
  }
  if (hasPermission(user, "assets.manage")) {
    const assets = await Asset.find({ $or: [{ tag: re }, { name: re }, { serial: re }] }, { tag: 1, name: 1 }).limit(4).lean();
    for (const a of assets) results.push({ type: "asset", id: idStr(a._id), title: `${a.tag} ${a.name}`, href: "/dashboard/purchasing?tab=assets" });
  }
  return NextResponse.json({ results });
}
