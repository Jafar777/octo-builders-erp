import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { canRouteStages } from "@/lib/projects";
import { getSettings } from "@/lib/settings";
import { localParts } from "@/lib/attendance";
import { MONTH_RE, todayIn } from "@/lib/hr";
import { enrichTasks } from "@/lib/tasks";
import Task from "@/models/Task";

// Task log (GM / CEO): every task created during ?month=YYYY-MM, in the company time zone,
// except the scheduled ones that haven't started yet ("todo").
// ?mine=1: any employee's own log (My Tasks → Task log).
export async function GET(request) {
  const user = await requireStaff();
  const mine = new URL(request.url).searchParams.get("mine") === "1";
  if (!user || (!mine && !canRouteStages(user))) return forbidden();

  const settings = await getSettings();
  const tz = settings.hr.timezone;
  const asked = new URL(request.url).searchParams.get("month");
  const month = MONTH_RE.test(asked || "") ? asked : todayIn(tz).slice(0, 7);

  // ± 1 day around the UTC month, then exact by the local date.
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1) - 86400000);
  const end = new Date(Date.UTC(y, m, 1) + 86400000);
  const tasks = (await Task.find({ createdAt: { $gte: start, $lt: end }, status: { $ne: "todo" }, ...(mine ? { assignee: user.id } : {}) }).sort({ createdAt: -1 }).lean()).filter((t) =>
    localParts(t.createdAt, tz).date.startsWith(month)
  );

  return NextResponse.json({ month, tasks: await enrichTasks(tasks) });
}
