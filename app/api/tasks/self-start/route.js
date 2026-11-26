import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, readJson } from "@/lib/apiUtils";
import { askWork, checkStart, offerHelp, selfStartOn, startOptions } from "@/lib/hybridServer";

// "Start work" (lib/hybridServer.js).
export async function GET() {
  const user = await requireStaff();
  if (!user) return forbidden();
  const on = await selfStartOn(user);
  return NextResponse.json({ on, projects: on ? await startOptions(user) : [] });
}

// { mode: "check" | "ask" | "help", projectId, stage, title, type, hours, reason, again,
//   urgent, taskId }. New work is always asked for: the stage's manager gives its hours
// before it can start ("start" is kept as a name for "ask").
export async function POST(request) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const b = await readJson(request);
  // Only a decision of the manager / CEO opens these.
  delete b.stageOk;
  delete b.fixedOk;
  delete b.decided;
  const run = { check: checkStart, start: askWork, ask: askWork, help: (u, x) => offerHelp(u, x.taskId) }[b.mode];
  if (!run) return fail("invalid_request");
  const res = await run(user, b);
  return res.error ? fail(res.error, 409, res.data || {}) : NextResponse.json(res);
}
