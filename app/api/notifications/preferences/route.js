import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { forbidden, readJson } from "@/lib/apiUtils";
import { NOTIFICATION_GROUPS } from "@/lib/notify";
import User from "@/models/User";

const clean = (prefs = {}) => ({
  muted: (Array.isArray(prefs.muted) ? prefs.muted : []).filter((g) => g in NOTIFICATION_GROUPS),
  email: ["important", "all", "none"].includes(prefs.email) ? prefs.email : "important",
  digest: prefs.digest !== false,
  sound: prefs.sound !== false,
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return forbidden();
  const doc = await User.findById(user.id, { notificationPrefs: 1 }).lean();
  return NextResponse.json({ preferences: clean(doc?.notificationPrefs), groups: Object.keys(NOTIFICATION_GROUPS) });
}

export async function PUT(request) {
  const user = await getCurrentUser();
  if (!user) return forbidden();
  const preferences = clean(await readJson(request));
  await User.updateOne({ _id: user.id }, { notificationPrefs: preferences });
  return NextResponse.json({ preferences });
}
