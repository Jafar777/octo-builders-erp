import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { canUseIntake } from "@/lib/intake";
import ProjectIntake from "@/models/ProjectIntake";
import WorkProject from "@/models/WorkProject";

// Projects that have no intake form (made before the forms, or imported): a form can be
// filled in for each of them on the intake page.
export async function GET() {
  const user = await requireStaff({ limited: true });
  if (!user || !canUseIntake(user)) return forbidden();
  const withForm = await ProjectIntake.distinct("workProject", { workProject: { $ne: null } });
  const projects = await WorkProject.find({ _id: { $nin: withForm } }, { name: 1, code: 1, status: 1, startDate: 1 }).sort({ createdAt: -1 }).lean();
  return NextResponse.json({
    projects: projects.map((p) => ({ id: String(p._id), name: p.name, code: p.code || "", status: p.status })),
  });
}
