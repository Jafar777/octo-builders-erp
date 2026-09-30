import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Project from "@/models/Project";
import { requireAdmin } from "@/lib/requireAdmin";
import { projectPayload } from "@/lib/itemPayload";

export async function PUT(request, { params }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const data = projectPayload(await request.json());
  if (!data) return NextResponse.json({ error: "bilingual_required" }, { status: 400 });

  await connectDB();
  await Project.findByIdAndUpdate(id, data);

  return NextResponse.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  await connectDB();
  await Project.findByIdAndDelete(id);

  return NextResponse.json({ ok: true });
}
