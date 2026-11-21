import { NextResponse } from "next/server";
import { clearSessionCookie, clearViewAsCookie } from "@/lib/auth";

export async function POST() {
  await clearSessionCookie();
  await clearViewAsCookie();
  return NextResponse.json({ ok: true });
}
