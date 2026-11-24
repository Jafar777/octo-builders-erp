import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { canUseOffice } from "@/lib/officeServer";
import { NAME_FIELDS, pickName, viewerLang } from "@/lib/personName";
import { DEFAULT_ROLE, HIDDEN_ROLES } from "@/lib/permissions";
import Client from "@/models/Client";
import Department from "@/models/Department";
import Lead from "@/models/Lead";
import User from "@/models/User";
import WorkProject from "@/models/WorkProject";

// Everything the office's pickers choose from (@ people / departments, # clients /
// projects / inquiries), in one call.
export async function GET() {
  const user = await getCurrentUser();
  if (!canUseOffice(user)) return forbidden();
  const lang = await viewerLang();
  const [people, departments, clients, projects, leads] = await Promise.all([
    User.find({ status: "active", role: { $nin: [DEFAULT_ROLE, ...HIDDEN_ROLES] } }, { ...NAME_FIELDS, avatarUrl: 1, department: 1 }).sort({ name: 1 }).lean(),
    Department.find({ active: { $ne: false } }, { name: 1, color: 1 }).lean(),
    Client.find({}, { name: 1, phone: 1 }).sort({ name: 1 }).limit(2000).lean(),
    WorkProject.find({ status: { $in: ["active", "on_hold"] } }, { name: 1, code: 1 }).sort({ updatedAt: -1 }).limit(500).lean(),
    Lead.find({ stage: { $nin: ["won", "lost"] } }, { name: 1, company: 1, phone: 1 }).sort({ updatedAt: -1 }).limit(500).lean(),
  ]);
  return NextResponse.json({
    people: people.map((p) => ({ id: String(p._id), name: pickName(p, lang), avatarUrl: p.avatarUrl || "", department: p.department ? String(p.department) : null })),
    departments: departments.map((d) => ({ id: String(d._id), name: d.name?.[lang] || d.name?.en || "", color: d.color || "" })),
    clients: clients.map((c) => ({ id: String(c._id), name: c.name, phone: c.phone || "" })),
    projects: projects.map((p) => ({ id: String(p._id), name: p.name?.[lang] || p.name?.en || "", code: p.code || "" })),
    leads: leads.map((l) => ({ id: String(l._id), name: l.company ? `${l.name} · ${l.company}` : l.name, phone: l.phone || "" })),
  });
}
