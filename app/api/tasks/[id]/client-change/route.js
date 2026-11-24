import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { applyChange, canAskChange, changeSetup, declineChange, previewChange, requestChange } from "@/lib/clientChangeServer";
import Task from "@/models/Task";

async function load(params) {
  const user = await requireStaff();
  if (!user) return { error: forbidden() };
  const { id } = await params;
  const task = isObjectId(id) ? await Task.findById(id) : null;
  if (!task) return { error: notFound() };
  if (!(await canAskChange(user, task))) return { error: forbidden() };
  return { user, task };
}

// What a client change to this approved task would touch.
export async function GET(request, { params }) {
  const { user, task, error } = await load(params);
  if (error) return error;
  const res = await changeSetup(user, task);
  return res.error ? fail(res.error, 409) : NextResponse.json(res);
}

// { mode: "preview" | "apply" | "request" | "decline", summary, hours, assigneeId, billing,
//   reason, items: [{ taskId, status, action, hours, assigneeId }] }
const MODES = { preview: previewChange, apply: applyChange, request: requestChange, decline: declineChange };
export async function POST(request, { params }) {
  const { user, task, error } = await load(params);
  if (error) return error;
  const body = await readJson(request);
  if (!Object.hasOwn(MODES, body.mode)) return fail("invalid_request");
  const res = await MODES[body.mode](user, task, body);
  return res.error ? fail(res.error, 409) : NextResponse.json(res);
}
