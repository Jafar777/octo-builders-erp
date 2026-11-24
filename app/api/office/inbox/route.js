import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { userDepartments } from "@/lib/scope";
import { isDeptManager } from "@/lib/managerKpi";
import { OPEN_STATUSES } from "@/lib/office";
import { serializeItems } from "@/lib/officeServer";
import OfficeItem from "@/models/OfficeItem";

// The answering side: what the office sent to me, or to the departments I manage —
// open ones, and the last week's closed ones.
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isStaff) return forbidden();
  const targets = [{ assignee: user.id }];
  if (isDeptManager(user)) targets.push({ department: { $in: userDepartments(user) }, assignee: null });
  const week = new Date(Date.now() - 7 * 86400000);
  const list = await OfficeItem.find({
    kind: { $ne: "admin_request" },
    $or: targets,
    $and: [{ $or: [{ status: { $in: OPEN_STATUSES } }, { closedAt: { $gte: week } }] }],
    sentAt: { $ne: null },
  })
    .sort({ status: 1, due: 1, sentAt: 1 })
    .limit(200)
    .lean();
  return NextResponse.json({ items: await serializeItems(list, user), canConvert: isDeptManager(user) });
}
