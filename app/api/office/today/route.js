import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { getSettings } from "@/lib/settings";
import { canUseOffice, todayBoard } from "@/lib/officeServer";

// The office's day in one call (the workspace's Today tab).
export async function GET() {
  const user = await getCurrentUser();
  if (!canUseOffice(user)) return forbidden();
  const settings = await getSettings();
  return NextResponse.json(await todayBoard(user, settings.hr.timezone));
}
