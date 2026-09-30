import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import User from "@/models/User";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null });

  await connectDB();
  const user = await User.findById(session.sub).lean();
  if (!user) return NextResponse.json({ user: null });

  return NextResponse.json({
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
    },
  });
}

export async function PATCH(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { name, avatarUrl } = await request.json();
  await connectDB();

  const update = {};
  if (typeof name === "string") update.name = name.trim().slice(0, 80);
  if (typeof avatarUrl === "string") update.avatarUrl = avatarUrl;

  const user = await User.findByIdAndUpdate(session.sub, update, { new: true }).lean();

  return NextResponse.json({
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
    },
  });
}
