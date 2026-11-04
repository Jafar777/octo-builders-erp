import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { peopleNames } from "@/lib/sales";
import Appraisal, { AppraisalCycle, COMPETENCIES } from "@/models/Appraisal";

const idStr = (v) => (v ? v.toString() : null);
const avg = (m) => {
  const v = Object.values(m || {}).filter((x) => x > 0);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : 0;
};

function serialize(a, cycles, names, viewer) {
  const cycle = cycles[idStr(a.cycle)];
  const isEmployee = idStr(a.employee) === viewer.id;
  // The employee sees the manager's review once it's submitted.
  const showManager = !isEmployee || Boolean(a.manager?.at);
  return {
    id: idStr(a._id),
    cycle: cycle ? { id: idStr(cycle._id), name: cycle.name, from: cycle.from, to: cycle.to, dueDate: cycle.dueDate, status: cycle.status, selfReview: cycle.selfReview } : null,
    employee: idStr(a.employee),
    employeeName: names[idStr(a.employee)] || "",
    reviewer: idStr(a.reviewer),
    reviewerName: names[idStr(a.reviewer)] || "",
    self: { scores: Object.fromEntries(a.self?.scores || []), comment: a.self?.comment || "", at: a.self?.at || null },
    manager: showManager
      ? { scores: Object.fromEntries(a.manager?.scores || []), comment: a.manager?.comment || "", strengths: a.manager?.strengths || "", goals: a.manager?.goals || "", at: a.manager?.at || null, overall: avg(Object.fromEntries(a.manager?.scores || [])) }
      : { at: null },
    acknowledgedAt: a.acknowledgedAt,
  };
}

// ?tab=mine (my reviews) | team (the ones I write) | cycles (appraisals.manage)
export async function GET(request) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const tab = new URL(request.url).searchParams.get("tab") || "mine";
  const admin = hasPermission(user, "appraisals.manage");
  if (tab === "cycles") {
    if (!admin) return forbidden();
    const cycles = await AppraisalCycle.find().sort({ createdAt: -1 }).lean();
    const all = await Appraisal.find({ cycle: { $in: cycles.map((c) => c._id) } }).lean();
    const names = await peopleNames(all.flatMap((a) => [a.employee, a.reviewer]));
    const cyclesById = Object.fromEntries(cycles.map((c) => [idStr(c._id), c]));
    return NextResponse.json({
      competencies: COMPETENCIES,
      cycles: cycles.map((c) => {
        const mine = all.filter((a) => idStr(a.cycle) === idStr(c._id));
        return {
          id: idStr(c._id),
          name: c.name,
          from: c.from,
          to: c.to,
          dueDate: c.dueDate,
          status: c.status,
          selfReview: c.selfReview,
          total: mine.length,
          selfDone: mine.filter((a) => a.self?.at).length,
          managerDone: mine.filter((a) => a.manager?.at).length,
          reviews: mine.map((a) => serialize(a, cyclesById, names, user)),
        };
      }),
    });
  }
  const query = tab === "team" ? { reviewer: user.id } : { employee: user.id };
  const list = await Appraisal.find(query).sort({ createdAt: -1 }).limit(300).lean();
  const cycles = Object.fromEntries((await AppraisalCycle.find({ _id: { $in: list.map((a) => a.cycle) } }).lean()).map((c) => [idStr(c._id), c]));
  const names = await peopleNames(list.flatMap((a) => [a.employee, a.reviewer]));
  return NextResponse.json({
    competencies: COMPETENCIES,
    admin,
    reviews: list.map((a) => serialize(a, cycles, names, user)),
  });
}
