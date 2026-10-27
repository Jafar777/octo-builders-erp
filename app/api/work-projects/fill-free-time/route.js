import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { getWorkCalendar, pullForward } from "@/lib/ganttServer";
import { trackDelays } from "@/lib/projectDelay";
import { canRouteStages } from "@/lib/projects";

// "Fill free time" on the Gantt (GM / CEO): not-started work moves earlier into free
// time the plan has (see pullForward). The plan otherwise only moves later on its own,
// so nobody's schedule changes without someone choosing to.
// Returns { moved: number }.
export async function POST() {
  const user = await requireStaff();
  if (!user || !canRouteStages(user)) return forbidden();
  const moved = await pullForward(await getWorkCalendar(), user);
  if (moved.length) {
    await audit(user, "plan.filled_free_time", { entityType: "task", summary: `${moved.length}` });
    await trackDelays({ cause: "pulled_forward" }, user);
  }
  return NextResponse.json({ moved: moved.length });
}
