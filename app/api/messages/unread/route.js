import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { totalUnread } from "@/lib/messaging";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isStaff) return NextResponse.json({ unread: 0 });
  return NextResponse.json({ unread: await totalUnread(user.id) });
}
