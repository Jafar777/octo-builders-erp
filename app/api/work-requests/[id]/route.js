import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { decideWork } from "@/lib/hybridServer";
import WorkRequest from "@/models/WorkRequest";

// { decision: "approve" | "decline", note } by whoever decides it; "cancel" by its owner.
export async function PATCH(request, { params }) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const b = await readJson(request);
  if (b.decision === "cancel") {
    const done = await WorkRequest.updateOne({ _id: id, by: user.id, status: "pending" }, { $set: { status: "cancelled" }, $unset: { lock: 1 } });
    return done.matchedCount ? NextResponse.json({ ok: true }) : fail("already_decided", 409);
  }
  const res = await decideWork(user, id, b.decision, b.note);
  if (res.error === "forbidden") return forbidden();
  return res.error ? fail(res.error, 409, res.data || {}) : NextResponse.json(res);
}
