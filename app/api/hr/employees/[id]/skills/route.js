import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { canApproveSkills, cleanSkill, sameSkill, splitSkills, serializeSkillRequests, skillApprovers } from "@/lib/skills";
import User from "@/models/User";

const MAX_REQUESTS = 30;

const result = (u) => ({ skills: u.skills || [], skillRequests: serializeSkillRequests(u.skillRequests) });

// The employee adds skills; each one waits for the general manager on its own.
// Body: { name } — "AutoCAD, 3ds Max، Revit" becomes three requests.
export async function POST(request, { params }) {
  const user = await requireStaff({ limited: true });
  const { id } = await params;
  if (!user || !isObjectId(id) || id !== user.id) return forbidden();
  const names = splitSkills((await readJson(request)).name);
  if (!names.length) return fail("skill_required");

  const me = await User.findById(id);
  if (!me) return notFound();
  const fresh = names.filter(
    (name) => !(me.skills || []).some((s) => sameSkill(s, name)) && !me.skillRequests.some((r) => r.status === "pending" && sameSkill(r.name, name))
  );
  if (!fresh.length) return fail((me.skills || []).some((s) => sameSkill(s, names[0])) ? "skill_exists" : "skill_pending", 409);
  // Asking again after a refusal replaces the old answer.
  me.skillRequests = me.skillRequests.filter((r) => !fresh.some((name) => sameSkill(r.name, name)));
  if (me.skillRequests.length + fresh.length > MAX_REQUESTS) return fail("too_many_skill_requests");
  for (const name of fresh) me.skillRequests.push({ name, status: "pending", requestedAt: new Date() });
  await me.save();

  await notify({
    type: "hr.skill_requested",
    recipients: await skillApprovers(),
    actor: user,
    params: { actor: user.name || user.email, skill: fresh.join("، ") },
    link: `/dashboard/staff?person=${id}`,
    entityType: "user",
    entityId: id,
  });
  return NextResponse.json(result(me), { status: 201 });
}

// The employee withdraws a pending request or dismisses a refused one. ?name=
export async function DELETE(request, { params }) {
  const user = await requireStaff({ limited: true });
  const { id } = await params;
  if (!user || !isObjectId(id) || id !== user.id) return forbidden();
  const name = cleanSkill(new URL(request.url).searchParams.get("name"));
  const me = await User.findById(id);
  if (!me) return notFound();
  me.skillRequests = me.skillRequests.filter((r) => !sameSkill(r.name, name));
  await me.save();
  return NextResponse.json(result(me));
}

// The general manager decides. Body: { name, decision: "approve" | "reject" }
export async function PATCH(request, { params }) {
  const user = await requireStaff({ limited: true });
  const { id } = await params;
  if (!user || !canApproveSkills(user) || !isObjectId(id)) return forbidden();
  const body = await readJson(request);
  const name = cleanSkill(body.name);
  if (!["approve", "reject"].includes(body.decision)) return fail("invalid_request");

  const person = await User.findById(id);
  if (!person) return notFound();
  const req = person.skillRequests.find((r) => r.status === "pending" && sameSkill(r.name, name));
  if (!req) return fail("skill_request_not_found", 404);

  if (body.decision === "approve") {
    if (!person.skills.some((s) => sameSkill(s, req.name))) person.skills.push(req.name);
    person.skillRequests = person.skillRequests.filter((r) => r !== req);
  } else {
    req.status = "rejected";
    req.reviewedBy = user.id;
    req.reviewedAt = new Date();
  }
  await person.save();

  const approved = body.decision === "approve";
  await audit(user, approved ? "hr.skill_approved" : "hr.skill_rejected", { entityType: "user", entityId: id, summary: req.name });
  await notify({
    type: approved ? "hr.skill_approved" : "hr.skill_rejected",
    recipients: [id],
    actor: user,
    params: { skill: req.name },
    link: "/dashboard/profile",
    entityType: "user",
    entityId: id,
  });
  return NextResponse.json(result(person));
}
