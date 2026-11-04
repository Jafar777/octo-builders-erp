import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { getUploadAuthParams } from "@/lib/imagekit";

// Short-lived ImageKit signature for direct browser uploads. Any active staff member
// may upload (chat attachments, HR documents, task files); what the file is then
// attached to is checked by that feature's own route.
export async function GET() {
  const user = await requireStaff({ limited: true });
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { token, expire, signature } = getUploadAuthParams();

  return NextResponse.json({
    token,
    expire,
    signature,
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  });
}
