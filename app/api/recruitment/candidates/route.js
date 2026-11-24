import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { Candidate, JobOpening } from "@/models/Recruitment";

const link = (v) => (/^https?:\/\//.test(String(v || "")) ? String(v).slice(0, 500) : "");

// { opening, name, email, phone, cvUrl, portfolioUrl, source }
export async function POST(request) {
  // Recruitment, or helping with it (the executive office adds CVs).
  const user = await getCurrentUser();
  if (!user?.isStaff || user.limited || !(hasPermission(user, "recruitment.manage") || hasPermission(user, "recruitment.assist"))) return forbidden();
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
