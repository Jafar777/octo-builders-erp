import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Project from "@/models/Project";
import { requireAdmin } from "@/lib/requireAdmin";

export async function PUT(request, { params }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  await connectDB();

  await Project.findByIdAndUpdate(id, {
    title: body.title,
    description: body.description,
    imageUrl: body.imageUrl,
    link: body.link,
    ...(typeof body.order === "number" ? { order: body.order } : {}),
  });

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
