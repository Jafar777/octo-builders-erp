import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Service from "@/models/Service";
import { requireAdmin } from "@/lib/requireAdmin";

export async function PUT(request, { params }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  await connectDB();

  await Service.findByIdAndUpdate(id, {
    title: body.title,
    description: body.description,
    imageUrl: body.imageUrl,
    ...(typeof body.order === "number" ? { order: body.order } : {}),
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  await connectDB();
  await Service.findByIdAndDelete(id);

  return NextResponse.json({ ok: true });
}
