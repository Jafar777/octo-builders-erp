import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { HYBRID_DEFAULTS } from "@/lib/hybrid";
import { hybridSettings } from "@/lib/hybridServer";
import { isTopRole } from "@/lib/permissions";
import { saveFirstBaseline } from "@/lib/projectDelay";
import Department from "@/models/Department";
import Setting from "@/models/Setting";
import Task from "@/models/Task";
import User from "@/models/User";
import WorkProject from "@/models/WorkProject";

const ceo = async () => {
  const user = await requireStaff();
  return isTopRole(user?.role) ? user : null;
};

// How work is planned and started (Settings page). The CEO only.
export async function GET() {
  if (!(await ceo())) return forbidden();
  const [settings, departments, people, waiting, untracked] = await Promise.all([
    hybridSettings(),
    Department.find({}, { name: 1 }).lean(),
    User.aggregate([{ $match: { status: "active", department: { $ne: null } } }, { $group: { _id: "$department", n: { $sum: 1 } } }]),
    Task.countDocuments({ status: "todo", "legacy.source": "excel-redo" }),
    WorkProject.countDocuments({ status: "active", forecastEnd: null }),
  ]);
  const count = Object.fromEntries(people.map((p) => [String(p._id), p.n]));
  return NextResponse.json({ settings, departments: departments.map((d) => ({ id: String(d._id), name: d.name, people: count[String(d._id)] || 0 })).filter((d) => d.people), waiting, untracked });
}

export async function PUT(request) {
  const user = await ceo();
  if (!user) return forbidden();
  const b = await readJson(request);
  const before = await hybridSettings();
  const known = new Set((await Department.find({}, { _id: 1 }).lean()).map((d) => String(d._id)));
  // A department keeps the day it was switched on (the Excel import goes by it).
  const departments = {};
  for (const id of Array.isArray(b.departments) ? b.departments.map(String) : []) if (known.has(id)) departments[id] = before.departments[id] || new Date().toISOString();
  const adjustPct = Number(b.adjustPct);
  if (!(adjustPct >= 0 && adjustPct <= 200)) return fail("invalid_request");
  const kpiFrom = /^\d{4}-(0[1-9]|1[0-2])$/.test(b.kpiFrom || "") ? b.kpiFrom : "";
  // Never a month that's already over: its results stand.
  if (kpiFrom && kpiFrom !== before.kpiFrom && kpiFrom < new Date().toISOString().slice(0, 7)) return fail("kpi_from_past");
  const hours = {};
  for (const [k, v] of Object.entries(b.hours || {})) {
    const n = Math.round(Number(v) * 2) / 2;
    if (/^[a-z0-9_]{1,40}$/.test(k) && n >= 0.5 && n <= 200) hours[k] = n;
  }
  const value = { departments, adjustPct, kpiFrom, endOfDay: b.endOfDay !== false, hours: { ...HYBRID_DEFAULTS.hours, ...hours } };
  await Setting.findOneAndUpdate({ key: "hybrid" }, { key: "hybrid", value }, { upsert: true });
  await audit(user, "settings.updated", { entityType: "settings", entityId: "hybrid", summary: "hybrid", details: { before, after: value } });
  return NextResponse.json({ settings: value });
}

// Starts tracking the expected delivery of the active projects that have none yet (it's
// what delays are measured from).
export async function POST() {
  const user = await ceo();
  if (!user) return forbidden();
  let n = 0;
  for (const p of await WorkProject.find({ status: "active", forecastEnd: null })) {
    await saveFirstBaseline(p, user);
    if (p.forecastEnd) n += 1;
  }
  await audit(user, "settings.updated", { entityType: "settings", entityId: "hybrid", summary: `tracking ${n}` });
  return NextResponse.json({ tracked: n });
}
