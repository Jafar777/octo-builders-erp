import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { runDailyJobs } from "@/lib/dailyJobs";

// Called once a day by Vercel Cron (see vercel.json) with
// "Authorization: Bearer <CRON_SECRET>": task reminders, repeating tasks, missing
// check-outs, contracts ending, offline fingerprint devices, project risk, budgets,
// and the email digest.
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await connectDB();
  return NextResponse.json({ ok: true, ...(await runDailyJobs()) });
}
