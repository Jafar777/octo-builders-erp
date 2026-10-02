import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { serializeNotification } from "@/lib/notify";
import { publish, userChannel } from "@/lib/realtime/server";
import { forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import Notification from "@/models/Notification";

const PAGE_SIZE = 20;

// ?before=<ISO date> for older pages, ?unread=1 for unread only.
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ notifications: [], unreadCount: 0 });

  const { searchParams } = new URL(request.url);
  const query = { user: user.id };
  const before = searchParams.get("before");
  if (before && !Number.isNaN(Date.parse(before))) query.createdAt = { $lt: new Date(before) };
  if (searchParams.get("unread") === "1") query.read = false;

  const [notifications, unreadCount] = await Promise.all([
    Notification.find(query).sort({ createdAt: -1 }).limit(PAGE_SIZE).lean(),
    Notification.countDocuments({ user: user.id, read: false }),
  ]);

  return NextResponse.json({
    notifications: notifications.map(serializeNotification),
    unreadCount,
    hasMore: notifications.length === PAGE_SIZE,
  });
}

// Body { ids: [...] } marks those as read; an empty body marks everything read.
export async function PATCH(request) {
  const user = await getCurrentUser();
  if (!user) return forbidden();

  const { ids } = await readJson(request);
  const filter = { user: user.id, read: false };
  if (Array.isArray(ids)) filter._id = { $in: ids.filter(isObjectId) };

  await Notification.updateMany(filter, { read: true, readAt: new Date() });
  const unreadCount = await Notification.countDocuments({ user: user.id, read: false });
  // Other open tabs of the same user update their badge too.
  await publish(userChannel(user.id), "notification:read", { unreadCount });

  return NextResponse.json({ ok: true, unreadCount });
}
