import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { getUploadAuthParams } from "@/lib/imagekit";

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { token, expire, signature } = getUploadAuthParams();

  return NextResponse.json({
    token,
    expire,
    signature,
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  });
}
