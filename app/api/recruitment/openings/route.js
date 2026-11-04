import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { peopleNames } from "@/lib/sales";
import { Candidate, JobOpening } from "@/models/Recruitment";

const idStr = (v) => (v ? v.toString() : null);

// Openings with their candidates (the Recruitment page).
export async function GET() {
  const user = await requirePermission("recruitment.manage");
  if (!user) return forbidden();
  const [openings, candidates] = await Promise.all([JobOpening.find().sort({ createdAt: -1 }).lean(), Candidate.find().sort({ updatedAt: -1 }).limit(2000).lean()]);
  const names = await peopleNames(candidates.flatMap((c) => [...(c.notes || []).map((n) => n.by), ...(c.interviews || []).flatMap((i) => i.with || []), ...(c.onboarding || []).map((o) => o.assignee)]));
  return NextResponse.json({
    openings: openings.map((o) => ({ id: idStr(o._id), title: o.title, department: idStr(o.department), branch: idStr(o.branch), description: o.description, positions: o.positions, status: o.status, createdAt: o.createdAt })),
    candidates: candidates.map((c) => ({
      id: idStr(c._id),
      opening: idStr(c.opening),
      name: c.name,
      email: c.email,
      phone: c.phone,
      cvUrl: c.cvUrl,
      portfolioUrl: c.portfolioUrl,
      source: c.source,
      stage: c.stage,
      rating: c.rating,
      notes: (c.notes || []).map((n) => ({ text: n.text, by: names[idStr(n.by)] || "", at: n.at })),
      interviews: (c.interviews || []).map((i) => ({ date: i.date, with: (i.with || []).map((w) => names[idStr(w)] || ""), rating: i.rating, note: i.note })),
      startDate: c.startDate,
      hiredUser: idStr(c.hiredUser),
      onboarding: (c.onboarding || []).map((o) => ({ title: o.title, assignee: names[idStr(o.assignee)] || "" })),
      rejectReason: c.rejectReason,
      updatedAt: c.updatedAt,
    })),
  });
}

// { title, department, branch, description, positions }
export async function POST(request) {
  const user = await requirePermission("recruitment.manage");
  if (!user) return forbidden();
  const b = await readJson(request);
  const title = String(b.title || "").trim().slice(0, 150);
  if (!title) return fail("title_required");
  const o = await JobOpening.create({
    title,
    department: isObjectId(b.department) ? b.department : null,
    branch: isObjectId(b.branch) ? b.branch : null,
    description: String(b.description || "").slice(0, 4000),
    positions: Math.max(1, Math.min(50, Number(b.positions) || 1)),
    createdBy: user.id,
  });
  await audit(user, "recruitment.opening_added", { entityType: "opening", entityId: o._id, summary: title });
  return NextResponse.json({ id: idStr(o._id) }, { status: 201 });
}
