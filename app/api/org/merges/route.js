import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { checkMerge, createMerge, endExpiredMerges, mergeManagerCandidates, parseEndsAt, serializeMerge } from "@/lib/departmentMerge";
import { pickName, viewerLang } from "@/lib/personName";
import DepartmentMerge from "@/models/DepartmentMerge";

const idStr = (v) => (v ? v.toString() : null);

// The temporary department merges (live ones, then the last ended ones) and the
// managers who can lead one.
export async function GET() {
  const user = await requirePermission("org.manage");
  if (!user) return forbidden();
  await endExpiredMerges({ force: true });

  const [active, ended, candidates, lang] = await Promise.all([
    DepartmentMerge.find({ status: "active" }).sort({ createdAt: -1 }).lean(),
    DepartmentMerge.find({ status: "ended" }).sort({ endedAt: -1 }).limit(10).lean(),
    mergeManagerCandidates(),
    viewerLang(),
  ]);
  return NextResponse.json({
    merges: [...active, ...ended].map(serializeMerge),
    managers: candidates.map((u) => ({
      id: u._id.toString(),
      name: pickName(u, lang),
      avatarUrl: u.avatarUrl || "",
      department: idStr(u.department),
      managedDepartments: (u.managedDepartments || []).map(idStr),
    })),
  });
}

export async function POST(request) {
  const actor = await requirePermission("org.manage");
  if (!actor) return forbidden();
  const body = await readJson(request);
  const departments = [...new Set((Array.isArray(body.departments) ? body.departments : []).map(String).filter(isObjectId))];
  const managerId = isObjectId(body.managerId) ? String(body.managerId) : null;
  const endsAt = parseEndsAt(body.endsAt);
  if (!managerId || endsAt === undefined) return fail("invalid_request");

  const error = await checkMerge({ departments, managerId, endsAt });
  if (error) return fail(error, error === "merge_department_busy" ? 409 : 400);

  const merge = await createMerge(actor, { departments, managerId, endsAt, note: String(body.note || "").trim().slice(0, 300) });
  return NextResponse.json({ merge: serializeMerge(merge.toObject()) }, { status: 201 });
}
