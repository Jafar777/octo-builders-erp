import { NextResponse } from "next/server";
import { getCurrentUser, publicUser } from "@/lib/currentUser";
import { forbidden, readJson } from "@/lib/apiUtils";
import User from "@/models/User";

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user: publicUser(user) });
}

export async function PATCH(request) {
  const user = await getCurrentUser();
  if (!user) return forbidden();

  const { name, avatarUrl, phone } = await readJson(request);
  const update = {};
  if (typeof name === "string") update.name = name.trim().slice(0, 80);
  if (typeof avatarUrl === "string") update.avatarUrl = avatarUrl;
  if (typeof phone === "string") update.phone = phone.trim().slice(0, 30);

  await User.findByIdAndUpdate(user.id, update);
  return NextResponse.json({ user: publicUser({ ...user, ...update }) });
}
