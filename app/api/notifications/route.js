import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Notification from "@/models/Notification";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ notifications: [], unreadCount: 0 });

  await connectDB();
  const notifications = await Notification.find({ user: session.sub })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  const unreadCount = await Notification.countDocuments({ user: session.sub, read: false });

  return NextResponse.json({
    notifications: notifications.map((n) => ({ ...n, id: n._id.toString(), _id: undefined })),
    unreadCount,
  });
}

export async function PATCH() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await connectDB();
  await Notification.updateMany({ user: session.sub, read: false }, { read: true });

  return NextResponse.json({ ok: true });
}
