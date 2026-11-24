import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { publish, userChannel } from "@/lib/realtime/server";
import { forbidden, readJson } from "@/lib/apiUtils";
import Notification from "@/models/Notification";
import { pagesLinkRegex } from "@/lib/pageLinks";

// The page a notification opens: its link without ?query or #hash.
const PATH = { $arrayElemAt: [{ $split: [{ $arrayElemAt: [{ $split: ["$link", "?"] }, 0] }, "#"] }, 0] };

// Unread notifications per page, for the sidebar badges: { counts: { "/dashboard/hr": 2 } }.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ counts: {} });
  const rows = await Notification.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(user.id), read: false, link: { $regex: "^/dashboard" } } },
    { $group: { _id: PATH, n: { $sum: 1 } } },
  ]);
  return NextResponse.json({ counts: Object.fromEntries(rows.map((r) => [r._id, r.n])) });
}

// Body { paths, exact }: the person opened a sidebar page, so everything its badge
// counted (lib/pageLinks.js) is seen — it was listed on top of the page.
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return forbidden();
  // The CEO looking through someone's eyes doesn't mark their notifications as read.
  if (user.actingAs) return NextResponse.json({ ok: true, unreadCount: await Notification.countDocuments({ user: user.id, read: false }) });
  const { paths, exact } = await readJson(request);
  const regex = pagesLinkRegex(paths, Boolean(exact));
  if (!regex) return forbidden();
  const res = await Notification.updateMany(
    { user: user.id, read: false, link: { $regex: regex } },
    { read: true, readAt: new Date() }
  );
  if (res.modifiedCount) {
    const unreadCount = await Notification.countDocuments({ user: user.id, read: false });
    await publish(userChannel(user.id), "notification:read", { unreadCount });
  }
  return NextResponse.json({ ok: true, cleared: res.modifiedCount });
}
