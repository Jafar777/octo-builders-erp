import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { Candidate, JobOpening } from "@/models/Recruitment";

const link = (v) => (/^https?:\/\//.test(String(v || "")) ? String(v).slice(0, 500) : "");

// { opening, name, email, phone, cvUrl, portfolioUrl, source }
export async function POST(request) {
  const user = await requirePermission("recruitment.manage");
  if (!user) return forbidden();
  const b = await readJson(request);
  if (!isObjectId(b.opening) || !(await JobOpening.exists({ _id: b.opening }))) return fail("invalid_request");
  const name = String(b.name || "").trim().slice(0, 150);
  if (!name) return fail("title_required");
  const c = await Candidate.create({
    opening: b.opening,
    name,
    email: String(b.email || "").trim().slice(0, 150),
    phone: String(b.phone || "").trim().slice(0, 40),
    cvUrl: link(b.cvUrl),
    portfolioUrl: link(b.portfolioUrl),
    source: String(b.source || "").slice(0, 80),
    createdBy: user.id,
  });
  await audit(user, "recruitment.candidate_added", { entityType: "candidate", entityId: c._id, summary: name });
  return NextResponse.json({ id: c._id.toString() }, { status: 201 });
}
