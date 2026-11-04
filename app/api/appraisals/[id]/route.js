import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { notify } from "@/lib/notify";
import Appraisal, { AppraisalCycle, COMPETENCIES } from "@/models/Appraisal";

const cleanScores = (s) => Object.fromEntries(COMPETENCIES.map((k) => [k, Math.min(5, Math.max(0, Math.round(Number(s?.[k]) || 0)))]).filter(([, v]) => v > 0));

// { self: { scores, comment } }                          the employee, while the cycle is open
// { manager: { scores, comment, strengths, goals } }     the reviewer (or appraisals.manage)
// { acknowledge: true }                                  the employee, after reading it
export async function PATCH(request, { params }) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const a = await Appraisal.findById(id);
  if (!a) return notFound();
  const cycle = await AppraisalCycle.findById(a.cycle).lean();
  const b = await readJson(request);
  const isEmployee = a.employee.toString() === user.id;
  const isReviewer = a.reviewer?.toString() === user.id || hasPermission(user, "appraisals.manage");

  if (b.self) {
    if (!isEmployee || cycle?.status !== "open" || !cycle.selfReview) return forbidden();
    a.self = { scores: cleanScores(b.self.scores), comment: String(b.self.comment || "").slice(0, 3000), at: new Date() };
  } else if (b.manager) {
    if (!isReviewer || isEmployee || cycle?.status !== "open") return forbidden();
    const scores = cleanScores(b.manager.scores);
    if (Object.keys(scores).length < COMPETENCIES.length) return fail("appraisal_scores_missing");
    a.manager = {
      scores,
      comment: String(b.manager.comment || "").slice(0, 3000),
      strengths: String(b.manager.strengths || "").slice(0, 2000),
      goals: String(b.manager.goals || "").slice(0, 2000),
      at: new Date(),
    };
    await notify({ type: "appraisal.reviewed", recipients: [a.employee.toString()], actor: user, params: { name: cycle.name }, link: "/dashboard/appraisals", entityType: "appraisal", entityId: a._id });
  } else if (b.acknowledge) {
    if (!isEmployee || !a.manager?.at) return forbidden();
    a.acknowledgedAt = new Date();
  } else {
    return fail("invalid_request");
  }
  await a.save();
  return NextResponse.json({ ok: true });
}
