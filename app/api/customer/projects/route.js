import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { buildCells } from "@/lib/projects";
import Task from "@/models/Task";
import WorkProject from "@/models/WorkProject";

// A customer's projects: how far along each one is, its stages and when it's expected
// to be delivered. Nothing internal (people's hours, costs, reviews by the team).
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isCustomer) return forbidden();
  const projects = await WorkProject.find({ customer: user.id, status: { $ne: "archived" } }).sort({ status: 1, dueDate: 1 }).lean();
  const tasks = await Task.find(
    { project: { $in: projects.map((p) => p._id) } },
    { project: 1, stage: 1, revision: 1, status: 1, kind: 1, createdAt: 1, assignee: 1, number: 1, estimatedHours: 1, maxHours: 1, reviewLevel: 1 }
  ).lean();
  return NextResponse.json({
    projects: projects.map((p) => {
      const list = tasks.filter((t) => t.project.toString() === p._id.toString());
      const { cells, progress } = buildCells(p, list);
      return {
        id: p._id.toString(),
        code: p.code,
        name: p.name,
        status: p.status,
        progress: Math.round(progress * 100),
        startDate: p.startDate,
        dueDate: p.dueDate,
        expectedEnd: p.forecastEnd || null,
        stages: p.stages.map((s) => ({ key: s.key, name: s.name, status: cells[s.key]?.status || "not_started" })),
        // Work handed in and waiting for this customer's review.
        waitingForYou: list.filter((t) => t.status === "submitted" && t.reviewLevel === "customer").length,
      };
    }),
  });
}
