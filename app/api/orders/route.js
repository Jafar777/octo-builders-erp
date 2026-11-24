import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { selfStartOn } from "@/lib/hybridServer";
import { ordersWaiting } from "@/lib/orders";

// The Requests page and its sidebar badge: what waits for this person's answer.
export async function GET() {
  const user = await requireStaff();
  if (!user) return forbidden();
  const { decides, counts } = await ordersWaiting(user);
  const purchasing = ["purchasing.request", "purchasing.approve", "assets.manage"].some((p) => hasPermission(user, p));
  return NextResponse.json({ decides, counts, purchasing, work: decides.work || (await selfStartOn(user)) });
}
