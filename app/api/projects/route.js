import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Project from "@/models/Project";
import { requireAdmin } from "@/lib/requireAdmin";
import { getProjects } from "@/lib/siteData";
import { projectPayload } from "@/lib/itemPayload";

export async function GET() {
  return NextResponse.json({ projects: await getProjects() });
}

export async function POST(request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const data = projectPayload(await request.json());
  if (!data) return NextResponse.json({ error: "bilingual_required" }, { status: 400 });

  await connectDB();
  const count = await Project.countDocuments();
  const doc = await Project.create({ ...data, order: count });

  return NextResponse.json({ id: doc._id.toString() }, { status: 201 });
}

// Body: { ids: [...] } in the new display order.
export async function PATCH(request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { ids } = await request.json();
  if (!Array.isArray(ids)) return NextResponse.json({ error: "invalid_order" }, { status: 400 });

  await connectDB();
  await Project.bulkWrite(
    ids.map((id, order) => ({ updateOne: { filter: { _id: id }, update: { order } } }))
  );

  return NextResponse.json({ ok: true });
}
