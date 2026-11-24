import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { serializeRequests, startedByThemselves, workQueue } from "@/lib/hybridServer";
import { ordersDecides } from "@/lib/orders";
import WorkRequest from "@/models/WorkRequest";

// ?tab=mine | queue | activity (work started without a plan; those who decide only)
export async function GET(request) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const tab = new URL(request.url).searchParams.get("tab") || "mine";
  if (tab === "activity") return ordersDecides(user).work ? NextResponse.json(await startedByThemselves(user)) : forbidden();
  const list = tab === "queue" ? await workQueue(user) : await WorkRequest.find({ by: user.id }).sort({ createdAt: -1 }).limit(100).lean();
  return NextResponse.json({ requests: await serializeRequests(list, user) });
}
